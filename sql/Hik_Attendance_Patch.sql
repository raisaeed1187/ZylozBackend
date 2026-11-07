/* =====================================================================
   Hikvision Attendance - patch for this project's schema
   Run AFTER Hikvision_setup/01_hik_attendance.sql, in the SAME database.
   Safe to run more than once.

   Why: the setup script used TenantId INT, but TenantId is NVARCHAR(65)
   everywhere in this project (Employee, AttendanceLogs, session context),
   and it had placeholder names for the tenant security policy.
   ===================================================================== */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------------
   1. TenantId INT -> NVARCHAR(65)
   --------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('dbo.HikDevices') AND c.name = 'TenantId' AND t.name = 'int')
    ALTER TABLE dbo.HikDevices ALTER COLUMN TenantId NVARCHAR(65) NOT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('dbo.AttRawPunch') AND c.name = 'TenantId' AND t.name = 'int')
BEGIN
    DROP INDEX IF EXISTS IX_AttRawPunch_Tenant_Date_Emp ON dbo.AttRawPunch;
    ALTER TABLE dbo.AttRawPunch ALTER COLUMN TenantId NVARCHAR(65) NOT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AttRawPunch_Tenant_Date_Emp'
               AND object_id = OBJECT_ID('dbo.AttRawPunch'))
CREATE INDEX IX_AttRawPunch_Tenant_Date_Emp
    ON dbo.AttRawPunch (TenantId, PunchDate, EmpNo) INCLUDE (PunchTime, VerifyMinor);
GO

/* ---------------------------------------------------------------------
   2. Ingest SP with the NVARCHAR tenant (only @TenantId changed)
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Hik_IngestEvent
    @Token           VARCHAR(64),
    @DeviceSerial    VARCHAR(50)    = NULL,
    @EventType       VARCHAR(50)    = NULL,
    @MajorEventType  INT            = NULL,
    @SubEventType    INT            = NULL,
    @SerialNo        INT            = NULL,
    @EmpNo           VARCHAR(30)    = NULL,
    @EmpName         NVARCHAR(100)  = NULL,
    @PunchTime       VARCHAR(40)    = NULL,   -- "2026-11-05T20:49:11+04:00"
    @VerifyMode      VARCHAR(50)    = NULL,
    @AttStatus       VARCHAR(20)    = NULL,
    @RawJson         NVARCHAR(MAX)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @DeviceId INT, @TenantId NVARCHAR(65), @Result VARCHAR(30);

    SELECT @DeviceId = DeviceId, @TenantId = TenantId
    FROM dbo.HikDevices
    WHERE PushToken = @Token
      AND IsActive = 1
      AND (@DeviceSerial IS NULL OR DeviceSerial = @DeviceSerial);

    IF @DeviceId IS NULL
    BEGIN
        INSERT dbo.HikEventLog (DeviceId, EventType, SubEventType, Result, RawJson)
        VALUES (NULL, @EventType, @SubEventType, 'UnknownDevice', LEFT(@RawJson, 4000));
        SELECT 'UnknownDevice' AS Result;
        RETURN;
    END

    UPDATE dbo.HikDevices SET LastSeenAt = SYSUTCDATETIME() WHERE DeviceId = @DeviceId;

    -- Only successful authentications: major 5, minor 1 card / 38 fingerprint / 75 face
    IF ISNULL(@EventType, '') <> 'AccessControllerEvent'
       OR ISNULL(@MajorEventType, 0) <> 5
       OR ISNULL(@SubEventType, 0) NOT IN (1, 38, 75)
       OR @EmpNo IS NULL OR @SerialNo IS NULL OR @PunchTime IS NULL
    BEGIN
        SET @Result = 'Ignored';
    END
    ELSE
    BEGIN
        EXEC sp_set_session_context @key = N'TenantId', @value = @TenantId;

        BEGIN TRY
            INSERT dbo.AttRawPunch
                (TenantId, DeviceId, SerialNo, EmpNo, EmpName, PunchTime, VerifyMinor, VerifyMode, AttStatus, Source)
            VALUES
                (@TenantId, @DeviceId, @SerialNo, @EmpNo, @EmpName,
                 CAST(@PunchTime AS DATETIMEOFFSET), @SubEventType, @VerifyMode, @AttStatus, 'Push');
            SET @Result = 'Inserted';
        END TRY
        BEGIN CATCH
            IF ERROR_NUMBER() IN (2627, 2601)       -- unique violation = already stored
                SET @Result = 'Duplicate';
            ELSE
            BEGIN
                EXEC sp_set_session_context @key = N'TenantId', @value = NULL;
                THROW;                               -- Node returns 500 -> device retries
            END
        END CATCH

        EXEC sp_set_session_context @key = N'TenantId', @value = NULL;  -- pooled connection hygiene
    END

    -- Keep the log small: skip door/heartbeat noise
    IF @Result <> 'Ignored'
        INSERT dbo.HikEventLog (DeviceId, EventType, SubEventType, Result, RawJson)
        VALUES (@DeviceId, @EventType, @SubEventType, @Result, @RawJson);

    SELECT @Result AS Result;
END
GO

/* ---------------------------------------------------------------------
   3. RLS: add AttRawPunch to the existing TenantSecurityPolicy
   --------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates
               WHERE target_object_id = OBJECT_ID('dbo.AttRawPunch'))
BEGIN
    DECLARE @Policy NVARCHAR(300) =
        (SELECT QUOTENAME(SCHEMA_NAME(schema_id)) + '.' + QUOTENAME(name)
         FROM sys.security_policies WHERE name = 'TenantSecurityPolicy');

    DECLARE @Stmt NVARCHAR(MAX) = N'ALTER SECURITY POLICY ' + @Policy + N'
        ADD FILTER PREDICATE Security.fnTenantAccessPredicate(TenantId) ON dbo.AttRawPunch,
        ADD BLOCK  PREDICATE Security.fnTenantAccessPredicate(TenantId) ON dbo.AttRawPunch AFTER INSERT;';

    EXEC sp_executesql @Stmt;
END
GO

/* ---------------------------------------------------------------------
   4. Register the device (run once, after filling in the tenant)
   TenantId is the same value users get in their login (Tenants.ID2),
   not the integer Tenants.ID. Generate the token with:
       SELECT LOWER(CONVERT(VARCHAR(64), CRYPT_GEN_RANDOM(32), 2));
   --------------------------------------------------------------------- */
-- INSERT dbo.HikDevices (TenantId, DeviceName, DeviceSerial, PushToken)
-- VALUES (N'<tenant-id>', N'Craft Engine', 'GS3763721', '<token>');
