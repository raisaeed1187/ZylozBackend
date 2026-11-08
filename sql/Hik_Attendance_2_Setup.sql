/* =====================================================================
   Hikvision Attendance - step 2: everything else
   Run in the SAME database as Hik_Attendance_1_Rename.sql, after it.
   Safe to run more than once.

   Tables (all in this database):  HikDevices, HikAttRawPunch, HikEventLog
   Also: Employee.HikPersonId, ingest SP, link SP, report SPs.
   Times are Dubai (+04:00).

   The backend writes device pushes to the database in HIK_DATABASE
   (.env), so HIK_DATABASE must be the name of THIS database.
   ===================================================================== */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.AttRawPunch') IS NOT NULL AND OBJECT_ID('dbo.HikAttRawPunch') IS NULL
    THROW 50131, N'Run Hik_Attendance_1_Rename.sql first.', 1;
GO

/* ---------------------------------------------------------------------
   1. Tables (created only if missing; existing data is kept)
   --------------------------------------------------------------------- */
IF OBJECT_ID('dbo.HikDevices') IS NULL
CREATE TABLE dbo.HikDevices (
    DeviceId      INT IDENTITY(1,1) PRIMARY KEY,
    TenantId      NVARCHAR(65)   NOT NULL,          -- Tenants.ID2
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

IF OBJECT_ID('dbo.HikAttRawPunch') IS NULL
CREATE TABLE dbo.HikAttRawPunch (
    Id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    TenantId      NVARCHAR(65)    NOT NULL,
    DeviceId      INT             NOT NULL REFERENCES dbo.HikDevices(DeviceId),
    SerialNo      INT             NOT NULL,         -- device event sequence (dedupe)
    EmpNo         VARCHAR(30)     NOT NULL,         -- person ID on the device = Employee.HikPersonId
    EmpName       NVARCHAR(100)   NULL,
    PunchTime     DATETIMEOFFSET  NOT NULL,         -- keeps +04:00
    PunchDate     AS CAST(SWITCHOFFSET(PunchTime, '+04:00') AS DATE) PERSISTED,
    VerifyMinor   INT             NULL,             -- 75 face, 38 fingerprint, 1 card
    VerifyMode    VARCHAR(50)     NULL,
    AttStatus     VARCHAR(20)     NULL,
    Source        VARCHAR(20)     NOT NULL DEFAULT 'Push',
    CreatedAt     DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_HikAttRawPunch_DeviceSerial UNIQUE (DeviceId, SerialNo)
);
GO

IF OBJECT_ID('dbo.HikEventLog') IS NULL
CREATE TABLE dbo.HikEventLog (
    Id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    DeviceId      INT            NULL,
    ReceivedAt    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),   -- UTC
    EventType     VARCHAR(50)    NULL,
    SubEventType  INT            NULL,
    Result        VARCHAR(30)    NOT NULL,          -- Inserted / Duplicate / UnknownDevice
    RawJson       NVARCHAR(MAX)  NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name IN ('IX_HikAttRawPunch_Tenant_Date_Emp', 'IX_AttRawPunch_Tenant_Date_Emp')
               AND object_id = OBJECT_ID('dbo.HikAttRawPunch'))
    CREATE INDEX IX_HikAttRawPunch_Tenant_Date_Emp
        ON dbo.HikAttRawPunch (TenantId, PunchDate, EmpNo)
        INCLUDE (PunchTime, VerifyMinor, DeviceId, EmpName);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HikEventLog_ReceivedAt'
               AND object_id = OBJECT_ID('dbo.HikEventLog'))
    CREATE INDEX IX_HikEventLog_ReceivedAt ON dbo.HikEventLog (ReceivedAt);
GO

/* ---------------------------------------------------------------------
   2. Row-level security: HikAttRawPunch in the tenant policy (if missing)
   --------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id = OBJECT_ID('dbo.HikAttRawPunch'))
   AND EXISTS (SELECT 1 FROM sys.security_policies WHERE name = 'TenantSecurityPolicy')
BEGIN
    DECLARE @Policy NVARCHAR(300) =
        (SELECT QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name)
         FROM sys.security_policies WHERE name = 'TenantSecurityPolicy');

    DECLARE @Stmt NVARCHAR(MAX) = N'ALTER SECURITY POLICY ' + @Policy + N'
        ADD FILTER PREDICATE Security.fnTenantAccessPredicate(TenantId) ON dbo.HikAttRawPunch,
        ADD BLOCK  PREDICATE Security.fnTenantAccessPredicate(TenantId) ON dbo.HikAttRawPunch AFTER INSERT;';

    EXEC sp_executesql @Stmt;
END
GO

/* ---------------------------------------------------------------------
   3. Ingest SP - called by Node (POST /api/hik/events/:token) per event.
   The tenant session context is needed because HikAttRawPunch has the
   row-level security BLOCK predicate: without it the insert is refused.
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

    -- token (+ serial when the device sends it) decides device and tenant
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
            INSERT dbo.HikAttRawPunch
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
   4. Remove objects from earlier versions of these scripts
   --------------------------------------------------------------------- */
DROP PROCEDURE IF EXISTS dbo.usp_Att_GetPunches;     -- replaced by usp_HikAtt_GetPunches
DROP SYNONYM   IF EXISTS dbo.Hik_AttRawPunch;        -- not needed: tables are in this database
DROP SYNONYM   IF EXISTS dbo.Hik_Devices;
GO

/* ---------------------------------------------------------------------
   5. Employee.HikPersonId (person ID enrolled on the device)
   Employee keeps one row per revision (highest RevisionNo = current), so
   the link is written to every revision row, and the lookup still works if
   a newer revision row was created without it. No unique index for that
   reason; usp_Employee_SetHikPersonId checks uniqueness instead.
   --------------------------------------------------------------------- */
IF COL_LENGTH('dbo.Employee', 'HikPersonId') IS NULL
    ALTER TABLE dbo.Employee ADD HikPersonId VARCHAR(30) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Employee_Tenant_HikPersonId'
               AND object_id = OBJECT_ID('dbo.Employee'))
    CREATE INDEX IX_Employee_Tenant_HikPersonId
        ON dbo.Employee (TenantId, HikPersonId)
        INCLUDE (ID2, RevisionNo)
        WHERE HikPersonId IS NOT NULL;
GO

/* ---------------------------------------------------------------------
   6. Device person ID -> current employee row
   --------------------------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_HikAtt_EmployeeLink (@TenantId NVARCHAR(65), @EmpNo VARCHAR(30))
RETURNS TABLE
AS
RETURN
    SELECT cur.ID2 AS EmployeeID2, cur.employeeId AS EmployeeCode, cur.name AS EmployeeName
    FROM (SELECT TOP (1) e.ID2
          FROM dbo.Employee e
          WHERE e.TenantId = @TenantId AND e.HikPersonId = @EmpNo
          ORDER BY ISNULL(e.RevisionNo, 0) DESC) k
    CROSS APPLY (SELECT TOP (1) e.ID2, e.employeeId, e.name
                 FROM dbo.Employee e
                 WHERE e.TenantId = @TenantId AND e.ID2 = k.ID2
                 ORDER BY ISNULL(e.RevisionNo, 0) DESC) cur;
GO

/* ---------------------------------------------------------------------
   7. Link / unlink an employee (@HikPersonId NULL = unlink)
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Employee_SetHikPersonId
    @TenantId     NVARCHAR(65),
    @EmployeeID2  NVARCHAR(65),
    @HikPersonId  VARCHAR(30) = NULL,
    @Reassign     BIT         = 0      -- 1 = move the ID from the employee who has it now
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @HikPersonId = NULLIF(LTRIM(RTRIM(@HikPersonId)), '');

    BEGIN TRAN;

    IF NOT EXISTS (SELECT 1 FROM dbo.Employee WITH (UPDLOCK, HOLDLOCK)
                   WHERE TenantId = @TenantId AND ID2 = @EmployeeID2)
        THROW 50111, N'Employee not found.', 1;

    IF @HikPersonId IS NOT NULL AND EXISTS (
        SELECT 1 FROM dbo.Employee WITH (UPDLOCK, HOLDLOCK)
        WHERE TenantId = @TenantId AND HikPersonId = @HikPersonId AND ID2 <> @EmployeeID2)
    BEGIN
        IF @Reassign = 0
            THROW 50110, N'This device ID is already linked to another employee.', 1;

        UPDATE dbo.Employee SET HikPersonId = NULL
        WHERE TenantId = @TenantId AND HikPersonId = @HikPersonId AND ID2 <> @EmployeeID2;
    END

    UPDATE dbo.Employee
    SET HikPersonId = @HikPersonId
    WHERE TenantId = @TenantId AND ID2 = @EmployeeID2;      -- every revision row

    IF @@ROWCOUNT = 0
        THROW 50111, N'Employee not found.', 1;

    COMMIT;
END
GO

/* ---------------------------------------------------------------------
   8. Report: summary strip
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_HikAtt_GetSummary
    @TenantId  NVARCHAR(65),
    @StartDate DATE,
    @EndDate   DATE,
    @DeviceId  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    WITH p AS (
        SELECT EmpNo, PunchDate, VerifyMinor
        FROM dbo.HikAttRawPunch
        WHERE TenantId = @TenantId
          AND PunchDate BETWEEN @StartDate AND @EndDate
          AND (@DeviceId IS NULL OR DeviceId = @DeviceId)
    ),
    d AS (SELECT EmpNo, PunchDate, COUNT(*) AS Punches FROM p GROUP BY EmpNo, PunchDate),
    m AS (SELECT DISTINCT EmpNo FROM p)
    SELECT
        TotalPunches      = (SELECT COUNT(*) FROM p),
        Employees         = (SELECT COUNT(*) FROM m),
        UnlinkedEmployees = (SELECT COUNT(*) FROM m
                             WHERE NOT EXISTS (SELECT 1 FROM dbo.Employee e
                                               WHERE e.TenantId = @TenantId AND e.HikPersonId = m.EmpNo)),
        EmployeeDays      = (SELECT COUNT(*) FROM d),
        PresentDays       = (SELECT COUNT(*) FROM d WHERE Punches > 1),
        MissPunchDays     = (SELECT COUNT(*) FROM d WHERE Punches = 1),
        FaceCount         = (SELECT COUNT(*) FROM p WHERE VerifyMinor = 75),
        FingerprintCount  = (SELECT COUNT(*) FROM p WHERE VerifyMinor = 38),
        CardCount         = (SELECT COUNT(*) FROM p WHERE VerifyMinor = 1),
        Devices           = (SELECT COUNT(*) FROM dbo.HikDevices WHERE TenantId = @TenantId AND IsActive = 1),
        LastActivity      = (SELECT CONVERT(VARCHAR(16), CAST(SWITCHOFFSET(CAST(MAX(LastSeenAt) AS DATETIMEOFFSET), '+04:00') AS DATETIME2), 120)
                             FROM dbo.HikDevices WHERE TenantId = @TenantId);
END
GO

/* ---------------------------------------------------------------------
   9. Report: daily (one row per device person per day)
   Present = 2+ punches, MissPunch = 1 punch
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_HikAtt_GetDaily
    @TenantId   NVARCHAR(65),
    @StartDate  DATE,
    @EndDate    DATE,
    @Search     NVARCHAR(100) = NULL,
    @DeviceId   INT           = NULL,
    @Status     VARCHAR(20)   = NULL,
    @PageNumber INT           = 1,
    @PageSize   INT           = 50
AS
BEGIN
    SET NOCOUNT ON;

    WITH p AS (
        SELECT EmpNo, EmpName, PunchDate, VerifyMinor,
               PunchLocal = SWITCHOFFSET(PunchTime, '+04:00')
        FROM dbo.HikAttRawPunch
        WHERE TenantId = @TenantId
          AND PunchDate BETWEEN @StartDate AND @EndDate
          AND (@DeviceId IS NULL OR DeviceId = @DeviceId)
    ),
    d AS (
        SELECT EmpNo, PunchDate,
               EmpName    = MAX(EmpName),
               FirstPunch = MIN(PunchLocal),
               LastPunch  = MAX(PunchLocal),
               PunchCount = COUNT(*),
               MinVerify  = MIN(VerifyMinor),
               MaxVerify  = MAX(VerifyMinor)
        FROM p
        GROUP BY EmpNo, PunchDate
    ),
    link AS (
        SELECT m.EmpNo, l.EmployeeID2, l.EmployeeCode, l.EmployeeName
        FROM (SELECT DISTINCT EmpNo FROM d) m
        OUTER APPLY dbo.fn_HikAtt_EmployeeLink(@TenantId, m.EmpNo) l
    ),
    f AS (
        SELECT d.*, k.EmployeeID2, k.EmployeeCode, k.EmployeeName,
               Status = CASE WHEN d.PunchCount = 1 THEN 'MissPunch' ELSE 'Present' END
        FROM d
        JOIN link k ON k.EmpNo = d.EmpNo
        WHERE @Search IS NULL
           OR d.EmpNo        LIKE '%' + @Search + '%'
           OR d.EmpName      LIKE '%' + @Search + '%'
           OR k.EmployeeCode LIKE '%' + @Search + '%'
           OR k.EmployeeName LIKE '%' + @Search + '%'
    )
    SELECT
        EmpNo,
        EmpName,
        EmployeeID2,
        EmployeeCode,
        EmployeeName,
        IsLinked      = CAST(CASE WHEN EmployeeID2 IS NULL THEN 0 ELSE 1 END AS BIT),
        PunchDate     = CONVERT(CHAR(10), PunchDate, 23),
        FirstIn       = CONVERT(CHAR(5), CAST(FirstPunch AS DATETIME2), 108),
        LastOut       = CASE WHEN PunchCount > 1 THEN CONVERT(CHAR(5), CAST(LastPunch AS DATETIME2), 108) END,
        WorkedMinutes = CASE WHEN PunchCount > 1 THEN DATEDIFF(MINUTE, FirstPunch, LastPunch) END,
        PunchCount,
        Method        = CASE WHEN MinVerify <> MaxVerify THEN 'Mixed'
                             WHEN MinVerify = 75 THEN 'Face'
                             WHEN MinVerify = 38 THEN 'Fingerprint'
                             WHEN MinVerify = 1  THEN 'Card'
                             ELSE 'Other' END,
        Status,
        TotalRows     = COUNT(*) OVER ()
    FROM f
    WHERE @Status IS NULL OR Status = @Status
    ORDER BY PunchDate DESC, FirstPunch DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

/* ---------------------------------------------------------------------
   10. Report: raw punches (also the drawer: @EmpNo + one date)
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_HikAtt_GetPunches
    @TenantId    NVARCHAR(65),
    @StartDate   DATE,
    @EndDate     DATE,
    @EmpNo       VARCHAR(30)   = NULL,
    @Search      NVARCHAR(100) = NULL,
    @DeviceId    INT           = NULL,
    @VerifyMinor INT           = NULL,
    @PageNumber  INT           = 1,
    @PageSize    INT           = 50
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.Id,
        p.EmpNo,
        p.EmpName,
        l.EmployeeID2,
        l.EmployeeCode,
        l.EmployeeName,
        IsLinked  = CAST(CASE WHEN l.EmployeeID2 IS NULL THEN 0 ELSE 1 END AS BIT),
        PunchDate = CONVERT(CHAR(10), p.PunchDate, 23),
        PunchTime = CONVERT(CHAR(8), CAST(SWITCHOFFSET(p.PunchTime, '+04:00') AS DATETIME2), 108),
        VerifyBy  = CASE p.VerifyMinor WHEN 75 THEN 'Face' WHEN 38 THEN 'Fingerprint' WHEN 1 THEN 'Card' ELSE 'Other' END,
        p.VerifyMode,
        p.AttStatus,
        p.Source,
        d.DeviceName,
        d.DeviceSerial,
        TotalRows = COUNT(*) OVER ()
    FROM dbo.HikAttRawPunch p
    JOIN dbo.HikDevices d ON d.DeviceId = p.DeviceId
    OUTER APPLY dbo.fn_HikAtt_EmployeeLink(@TenantId, p.EmpNo) l
    WHERE p.TenantId = @TenantId
      AND p.PunchDate BETWEEN @StartDate AND @EndDate
      AND (@EmpNo       IS NULL OR p.EmpNo = @EmpNo)
      AND (@DeviceId    IS NULL OR p.DeviceId = @DeviceId)
      AND (@VerifyMinor IS NULL OR p.VerifyMinor = @VerifyMinor)
      AND (@Search IS NULL
           OR p.EmpNo        LIKE '%' + @Search + '%'
           OR p.EmpName      LIKE '%' + @Search + '%'
           OR l.EmployeeCode LIKE '%' + @Search + '%'
           OR l.EmployeeName LIKE '%' + @Search + '%')
    ORDER BY p.PunchTime DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

/* ---------------------------------------------------------------------
   11. Report: devices of the company + punches in the period
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_HikAtt_GetDevices
    @TenantId  NVARCHAR(65),
    @StartDate DATE,
    @EndDate   DATE
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        d.DeviceId,
        d.DeviceName,
        d.DeviceSerial,
        d.IsActive,
        LastSeenAt = CONVERT(VARCHAR(16), CAST(SWITCHOFFSET(CAST(d.LastSeenAt AS DATETIMEOFFSET), '+04:00') AS DATETIME2), 120),
        PunchCount = ISNULL(s.PunchCount, 0),
        Employees  = ISNULL(s.Employees, 0),
        LastPunch  = CONVERT(VARCHAR(16), CAST(SWITCHOFFSET(s.LastPunch, '+04:00') AS DATETIME2), 120)
    FROM dbo.HikDevices d
    OUTER APPLY (
        SELECT PunchCount = COUNT(*), Employees = COUNT(DISTINCT p.EmpNo), LastPunch = MAX(p.PunchTime)
        FROM dbo.HikAttRawPunch p
        WHERE p.DeviceId = d.DeviceId
          AND p.TenantId = @TenantId
          AND p.PunchDate BETWEEN @StartDate AND @EndDate
    ) s
    WHERE d.TenantId = @TenantId
    ORDER BY d.DeviceName;
END
GO

/* ---------------------------------------------------------------------
   12. Run by hand when needed. Employee and HikAttRawPunch have
       row-level security: set the tenant first or you see 0 rows.

   EXEC sp_set_session_context @key = N'TenantId', @value = N'<tenant ID2>';

   -- a) Register a device (token: SELECT LOWER(CONVERT(VARCHAR(64), CRYPT_GEN_RANDOM(32), 2));)
   INSERT dbo.HikDevices (TenantId, DeviceName, DeviceSerial, PushToken)
   VALUES (N'<tenant ID2>', N'Craft Engine', 'GS3763721', '<token>');

   -- b) Link one employee
   EXEC dbo.usp_Employee_SetHikPersonId
        @TenantId = N'<tenant ID2>', @EmployeeID2 = N'<employee ID2>', @HikPersonId = '1';

   -- c) Device people not linked yet
   SELECT p.EmpNo, MAX(p.EmpName) AS NameOnDevice, COUNT(*) AS Punches
   FROM dbo.HikAttRawPunch p
   WHERE p.TenantId = N'<tenant ID2>'
     AND NOT EXISTS (SELECT 1 FROM dbo.Employee e
                     WHERE e.TenantId = p.TenantId AND e.HikPersonId = p.EmpNo)
   GROUP BY p.EmpNo ORDER BY p.EmpNo;

   -- d) Optional bulk link, ONLY if the device person ID = employee code (preview, then update)
   SELECT DISTINCT e.ID2, e.employeeId, e.name, p.EmpNo
   FROM dbo.Employee e
   JOIN dbo.HikAttRawPunch p ON p.TenantId = e.TenantId AND p.EmpNo = e.employeeId
   WHERE e.TenantId = N'<tenant ID2>' AND e.HikPersonId IS NULL;

   UPDATE e SET HikPersonId = e.employeeId
   FROM dbo.Employee e
   WHERE e.TenantId = N'<tenant ID2>' AND e.HikPersonId IS NULL
     AND EXISTS (SELECT 1 FROM dbo.HikAttRawPunch p
                 WHERE p.TenantId = e.TenantId AND p.EmpNo = e.employeeId)
     AND NOT EXISTS (SELECT 1 FROM dbo.Employee o
                     WHERE o.TenantId = e.TenantId AND o.HikPersonId = e.employeeId AND o.ID2 <> e.ID2);

   -- e) Housekeeping (daily job)
   DELETE dbo.HikEventLog WHERE ReceivedAt < DATEADD(DAY, -30, SYSUTCDATETIME());
   --------------------------------------------------------------------- */
