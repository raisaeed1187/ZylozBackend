/* =====================================================================
   Hikvision Attendance - Allbiz backend
   Tables + ingest stored procedure for device HTTP Listening push
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. Devices
   No RLS on this table: the device is looked up by its push token
   BEFORE the tenant is known. Only the ingest SP and admin screens use it.
   --------------------------------------------------------------------- */
IF OBJECT_ID('dbo.HikDevices') IS NULL
CREATE TABLE dbo.HikDevices (
    DeviceId      INT IDENTITY(1,1) PRIMARY KEY,
    TenantId      INT            NOT NULL,
    DeviceName    NVARCHAR(100)  NOT NULL,
    DeviceSerial  VARCHAR(50)    NOT NULL,          -- shortSerialNumber, e.g. GS3763721
    PushToken     VARCHAR(64)    NOT NULL,
    IsActive      BIT            NOT NULL DEFAULT 1,
    LastSeenAt    DATETIME2      NULL,              -- UTC
    CreatedAt     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_HikDevices_Token  UNIQUE (PushToken),
    CONSTRAINT UQ_HikDevices_Serial UNIQUE (DeviceSerial)
);
GO

/* ---------------------------------------------------------------------
   2. Raw punches (one row per successful face/fingerprint/card auth)
   --------------------------------------------------------------------- */
IF OBJECT_ID('dbo.AttRawPunch') IS NULL
CREATE TABLE dbo.AttRawPunch (
    Id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    TenantId      INT             NOT NULL,
    DeviceId      INT             NOT NULL REFERENCES dbo.HikDevices(DeviceId),
    SerialNo      INT             NOT NULL,         -- device event sequence (dedupe)
    EmpNo         VARCHAR(30)     NOT NULL,         -- employeeNoString from device
    EmpName       NVARCHAR(100)   NULL,
    PunchTime     DATETIMEOFFSET  NOT NULL,         -- keeps +04:00
    PunchDate     AS CAST(SWITCHOFFSET(PunchTime, '+04:00') AS DATE) PERSISTED,
    VerifyMinor   INT             NULL,             -- 75 face, 38 fingerprint, 1 card
    VerifyMode    VARCHAR(50)     NULL,
    AttStatus     VARCHAR(20)     NULL,             -- checkIn / checkOut (if sent)
    Source        VARCHAR(20)     NOT NULL DEFAULT 'Push',  -- Push / Backfill / Manual
    CreatedAt     DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_AttRawPunch_DeviceSerial UNIQUE (DeviceId, SerialNo)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AttRawPunch_Tenant_Date_Emp')
CREATE INDEX IX_AttRawPunch_Tenant_Date_Emp
    ON dbo.AttRawPunch (TenantId, PunchDate, EmpNo) INCLUDE (PunchTime, VerifyMinor);
GO

/* ---------------------------------------------------------------------
   3. Event log (raw JSON for troubleshooting; clean up after 30 days)
   --------------------------------------------------------------------- */
IF OBJECT_ID('dbo.HikEventLog') IS NULL
CREATE TABLE dbo.HikEventLog (
    Id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    DeviceId      INT            NULL,
    ReceivedAt    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    EventType     VARCHAR(50)    NULL,
    SubEventType  INT            NULL,
    Result        VARCHAR(30)    NOT NULL,          -- Inserted / Duplicate / Ignored / UnknownDevice
    RawJson       NVARCHAR(MAX)  NULL
);
GO

/* ---------------------------------------------------------------------
   4. Employee mapping (Option B: store Hikvision ID on the employee)
   Adjust table name if your employee table differs.
   --------------------------------------------------------------------- */
-- ALTER TABLE dbo.Employees ADD HikPersonId VARCHAR(30) NULL;
-- CREATE UNIQUE INDEX UX_Employees_Tenant_HikPersonId
--     ON dbo.Employees (TenantId, HikPersonId) WHERE HikPersonId IS NOT NULL;
GO

/* ---------------------------------------------------------------------
   5. RLS: add AttRawPunch to your EXISTING tenant security policy.
   Replace policy/function names with yours.
   --------------------------------------------------------------------- */
-- ALTER SECURITY POLICY dbo.TenantSecurityPolicy
--     ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.AttRawPunch,
--     ADD BLOCK  PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.AttRawPunch AFTER INSERT;
GO

/* ---------------------------------------------------------------------
   6. Ingest SP - called by Node for every event the device pushes
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

    DECLARE @DeviceId INT, @TenantId INT, @Result VARCHAR(30);

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
   7. Read SP for the React "Raw Punches" screen (tenant from session)
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Att_GetPunches
    @FromDate DATE,
    @ToDate   DATE,
    @EmpNo    VARCHAR(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    -- RLS filters by SESSION_CONTEXT('TenantId') set by your normal API middleware
    SELECT p.Id, p.EmpNo, p.EmpName, p.PunchTime, p.PunchDate,
           CASE p.VerifyMinor WHEN 75 THEN 'Face' WHEN 38 THEN 'Fingerprint' WHEN 1 THEN 'Card' ELSE 'Other' END AS VerifyBy,
           p.AttStatus, d.DeviceName, p.Source
    FROM dbo.AttRawPunch p
    JOIN dbo.HikDevices d ON d.DeviceId = p.DeviceId
    WHERE p.PunchDate BETWEEN @FromDate AND @ToDate
      AND (@EmpNo IS NULL OR p.EmpNo = @EmpNo)
    ORDER BY p.PunchTime DESC;
END
GO

/* ---------------------------------------------------------------------
   8. Register your device (run once; use YOUR TenantId and token)
   --------------------------------------------------------------------- */
-- INSERT dbo.HikDevices (TenantId, DeviceName, DeviceSerial, PushToken)
-- VALUES (1, N'Craft Engine', 'GS3763721', '<same-token-as-device-URL>');

/* ---------------------------------------------------------------------
   9. Housekeeping (SQL Agent job or Node cron, daily)
   --------------------------------------------------------------------- */
-- DELETE dbo.HikEventLog WHERE ReceivedAt < DATEADD(DAY, -30, SYSUTCDATETIME());
