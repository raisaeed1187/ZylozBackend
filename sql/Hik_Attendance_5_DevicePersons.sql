/* =====================================================================
   Hikvision Attendance - step 5: machine people (linked or not)
   Run in the same database as the earlier Hik_Attendance_* scripts,
   AFTER Hik_Attendance_4_Absent.sql. Safe to run more than once.

   Why: "Registered" used to count only system employees linked to a
   device ID. People enrolled on the machine but not (yet) in the system
   were missing. The server cannot read the machine's user list (the
   machine is on the office LAN), so every person who punches is now
   remembered in HikDevicePerson.

   Registered = linked system employees
              + machine people (HikDevicePerson) not linked to any employee
   Each person once, keyed by the device person ID (EmpNo).

   One punch on TODAY before 5 PM (Dubai) = Present (still at work);
   after 5 PM, or on any earlier day = Miss Punch. Cutoff: @MissPunchAfter
   in usp_HikAtt_GetSummary and usp_HikAtt_GetDaily.

   Absent counts from:  linked     -> employee joining date
                        not linked -> ActiveFrom, else date of first punch
   People enrolled on the machine who never punched: add them with
   usp_HikAtt_SaveDevicePerson (section 7).
   ===================================================================== */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------------
   1. Machine people (one row per tenant + device person ID)
   No row-level security: every SP filters by TenantId itself.
   --------------------------------------------------------------------- */
IF OBJECT_ID('dbo.HikDevicePerson') IS NULL
CREATE TABLE dbo.HikDevicePerson (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    TenantId      NVARCHAR(65)    NOT NULL,
    EmpNo         VARCHAR(30)     NOT NULL,          -- person ID on the machine
    NameOnDevice  NVARCHAR(100)   NULL,
    FirstSeenAt   DATETIMEOFFSET  NULL,              -- first punch
    LastSeenAt    DATETIMEOFFSET  NULL,              -- last punch
    ActiveFrom    DATE            NULL,              -- optional: count Absent from this date
    IsActive      BIT             NOT NULL DEFAULT 1,-- 0 = removed from machine, stop counting
    Source        VARCHAR(20)     NOT NULL DEFAULT 'Punch',   -- Punch / Manual
    CreatedAt     DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_HikDevicePerson_Tenant_EmpNo UNIQUE (TenantId, EmpNo)
);
GO

/* ---------------------------------------------------------------------
   2. Backfill from existing punches (per tenant: HikAttRawPunch has RLS)
   --------------------------------------------------------------------- */
DECLARE @T NVARCHAR(65);
DECLARE tenants CURSOR LOCAL FAST_FORWARD FOR SELECT DISTINCT TenantId FROM dbo.HikDevices;
OPEN tenants;
FETCH NEXT FROM tenants INTO @T;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC sp_set_session_context @key = N'TenantId', @value = @T;

    INSERT dbo.HikDevicePerson (TenantId, EmpNo, NameOnDevice, FirstSeenAt, LastSeenAt, Source)
    SELECT p.TenantId, p.EmpNo, MAX(p.EmpName), MIN(p.PunchTime), MAX(p.PunchTime), 'Punch'
    FROM dbo.HikAttRawPunch p
    WHERE p.TenantId = @T
      AND NOT EXISTS (SELECT 1 FROM dbo.HikDevicePerson x WHERE x.TenantId = p.TenantId AND x.EmpNo = p.EmpNo)
    GROUP BY p.TenantId, p.EmpNo;

    FETCH NEXT FROM tenants INTO @T;
END
CLOSE tenants;
DEALLOCATE tenants;
EXEC sp_set_session_context @key = N'TenantId', @value = NULL;
GO

/* ---------------------------------------------------------------------
   3. Ingest SP: same as before + remembers the person on every punch
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

    DECLARE @DeviceId INT, @TenantId NVARCHAR(65), @Result VARCHAR(30), @Pt DATETIMEOFFSET;

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
        SET @Pt = CAST(@PunchTime AS DATETIMEOFFSET);

        EXEC sp_set_session_context @key = N'TenantId', @value = @TenantId;

        BEGIN TRY
            INSERT dbo.HikAttRawPunch
                (TenantId, DeviceId, SerialNo, EmpNo, EmpName, PunchTime, VerifyMinor, VerifyMode, AttStatus, Source)
            VALUES
                (@TenantId, @DeviceId, @SerialNo, @EmpNo, @EmpName, @Pt, @SubEventType, @VerifyMode, @AttStatus, 'Push');
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

        -- Remember the machine person (also on Duplicate, so a retry completes it)
        UPDATE dbo.HikDevicePerson
        SET NameOnDevice = COALESCE(@EmpName, NameOnDevice),
            FirstSeenAt  = CASE WHEN FirstSeenAt IS NULL OR @Pt < FirstSeenAt THEN @Pt ELSE FirstSeenAt END,
            LastSeenAt   = CASE WHEN LastSeenAt  IS NULL OR @Pt > LastSeenAt  THEN @Pt ELSE LastSeenAt  END,
            IsActive     = 1
        WHERE TenantId = @TenantId AND EmpNo = @EmpNo;

        IF @@ROWCOUNT = 0
        BEGIN TRY
            INSERT dbo.HikDevicePerson (TenantId, EmpNo, NameOnDevice, FirstSeenAt, LastSeenAt, Source)
            VALUES (@TenantId, @EmpNo, @EmpName, @Pt, @Pt, 'Punch');
        END TRY
        BEGIN CATCH
            IF ERROR_NUMBER() NOT IN (2627, 2601) THROW;   -- another punch inserted it first: fine
        END CATCH
    END

    -- Keep the log small: skip door/heartbeat noise
    IF @Result <> 'Ignored'
        INSERT dbo.HikEventLog (DeviceId, EventType, SubEventType, Result, RawJson)
        VALUES (@DeviceId, @EventType, @SubEventType, @Result, @RawJson);

    SELECT @Result AS Result;
END
GO

/* ---------------------------------------------------------------------
   4. Registered people = linked employees + not-linked machine people
   --------------------------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_HikAtt_Registered (@TenantId NVARCHAR(65))
RETURNS TABLE
AS
RETURN
    WITH cur AS (
        SELECT e.ID2, e.employeeId, e.name, e.isDeleted, e.joiningDate,
               rn = ROW_NUMBER() OVER (PARTITION BY e.ID2 ORDER BY ISNULL(e.RevisionNo, 0) DESC)
        FROM dbo.Employee e
        WHERE e.TenantId = @TenantId
    ),
    k AS (
        SELECT ID2, HikPersonId = MAX(HikPersonId)
        FROM dbo.Employee
        WHERE TenantId = @TenantId AND HikPersonId IS NOT NULL
        GROUP BY ID2
    )
    -- linked system employees
    SELECT EmpNo        = k.HikPersonId,
           EmployeeID2  = c.ID2,
           EmployeeCode = c.employeeId,
           EmployeeName = c.name,
           NameOnDevice = CAST(NULL AS NVARCHAR(100)),
           StartDate    = TRY_CONVERT(DATE, c.joiningDate),
           IsLinked     = CAST(1 AS BIT)
    FROM cur c
    JOIN k ON k.ID2 = c.ID2
    WHERE c.rn = 1
      AND ISNULL(c.isDeleted, 0) = 0
    UNION ALL
    -- machine people not linked to any employee
    SELECT dp.EmpNo, NULL, NULL, NULL,
           dp.NameOnDevice,
           COALESCE(dp.ActiveFrom, CAST(SWITCHOFFSET(dp.FirstSeenAt, '+04:00') AS DATE)),
           CAST(0 AS BIT)
    FROM dbo.HikDevicePerson dp
    WHERE dp.TenantId = @TenantId
      AND dp.IsActive = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.Employee e
                      WHERE e.TenantId = @TenantId AND e.HikPersonId = dp.EmpNo);
GO

/* ---------------------------------------------------------------------
   5. Summary strip
   RegisteredEmployees = everyone above; LinkedEmployees / UnlinkedEmployees
   split it. With a device filter, Present / Miss Punch count that machine;
   Absent always means no punch on ANY machine.
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_HikAtt_GetSummary
    @TenantId  NVARCHAR(65),
    @StartDate DATE,
    @EndDate   DATE,
    @DeviceId  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today    DATE = CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '+04:00') AS DATE);
    DECLARE @To       DATE = CASE WHEN @EndDate > @Today THEN @Today ELSE @EndDate END;
    DECLARE @DayCount INT  = CASE WHEN @To >= @StartDate THEN DATEDIFF(DAY, @StartDate, @To) + 1 ELSE 0 END;

    -- Today before this time (Dubai) one punch = Present (still at work);
    -- after it, or on any earlier day, one punch = Miss Punch.
    DECLARE @MissPunchAfter TIME = '17:00';
    DECLARE @OpenDay DATE = CASE WHEN CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '+04:00') AS TIME) < @MissPunchAfter
                                 THEN @Today END;   -- NULL after the cutoff

    WITH days AS (
        SELECT TOP (@DayCount) D = DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, @StartDate)
        FROM sys.all_objects a CROSS JOIN sys.all_objects b
    ),
    reg AS (SELECT * FROM dbo.fn_HikAtt_Registered(@TenantId)),
    p AS (
        SELECT EmpNo, PunchDate, VerifyMinor
        FROM dbo.HikAttRawPunch
        WHERE TenantId = @TenantId
          AND PunchDate BETWEEN @StartDate AND @EndDate
          AND (@DeviceId IS NULL OR DeviceId = @DeviceId)
    ),
    pd AS (SELECT EmpNo, PunchDate, Punches = COUNT(*) FROM p GROUP BY EmpNo, PunchDate),
    anyp AS (
        SELECT DISTINCT EmpNo, PunchDate
        FROM dbo.HikAttRawPunch
        WHERE TenantId = @TenantId AND PunchDate BETWEEN @StartDate AND @To
    ),
    expected AS (
        SELECT r.EmpNo, d.D
        FROM reg r CROSS JOIN days d
        WHERE r.StartDate IS NULL OR d.D >= r.StartDate
    )
    SELECT
        RegisteredEmployees = (SELECT COUNT(*) FROM reg),
        LinkedEmployees     = (SELECT COUNT(*) FROM reg WHERE IsLinked = 1),
        UnlinkedEmployees   = (SELECT COUNT(*) FROM reg WHERE IsLinked = 0),
        Days                = @DayCount,
        ExpectedDays        = (SELECT COUNT(*) FROM expected),
        PresentDays         = (SELECT COUNT(*) FROM pd
                               WHERE (pd.Punches > 1 OR (pd.Punches = 1 AND pd.PunchDate = @OpenDay))
                                 AND EXISTS (SELECT 1 FROM reg r WHERE r.EmpNo = pd.EmpNo)),
        MissPunchDays       = (SELECT COUNT(*) FROM pd
                               WHERE pd.Punches = 1 AND (@OpenDay IS NULL OR pd.PunchDate <> @OpenDay)
                                 AND EXISTS (SELECT 1 FROM reg r WHERE r.EmpNo = pd.EmpNo)),
        AbsentDays          = (SELECT COUNT(*) FROM expected e
                               WHERE NOT EXISTS (SELECT 1 FROM anyp a WHERE a.EmpNo = e.EmpNo AND a.PunchDate = e.D)),
        TotalPunches        = (SELECT COUNT(*) FROM p),
        FaceCount           = (SELECT COUNT(*) FROM p WHERE VerifyMinor = 75),
        FingerprintCount    = (SELECT COUNT(*) FROM p WHERE VerifyMinor = 38),
        CardCount           = (SELECT COUNT(*) FROM p WHERE VerifyMinor = 1),
        Devices             = (SELECT COUNT(*) FROM dbo.HikDevices WHERE TenantId = @TenantId AND IsActive = 1),
        LastActivity        = (SELECT CONVERT(VARCHAR(16), CAST(SWITCHOFFSET(CAST(MAX(LastSeenAt) AS DATETIMEOFFSET), '+04:00') AS DATETIME2), 120)
                               FROM dbo.HikDevices WHERE TenantId = @TenantId);
END
GO

/* ---------------------------------------------------------------------
   6. Daily view: punch rows (Present / MissPunch) + Absent rows for
      everyone registered (linked or not)
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_HikAtt_GetDaily
    @TenantId   NVARCHAR(65),
    @StartDate  DATE,
    @EndDate    DATE,
    @Search     NVARCHAR(100) = NULL,
    @DeviceId   INT           = NULL,
    @Status     VARCHAR(20)   = NULL,   -- Present / MissPunch / Absent
    @PageNumber INT           = 1,
    @PageSize   INT           = 50
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today    DATE = CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '+04:00') AS DATE);
    DECLARE @To       DATE = CASE WHEN @EndDate > @Today THEN @Today ELSE @EndDate END;
    DECLARE @DayCount INT  = CASE WHEN @To >= @StartDate THEN DATEDIFF(DAY, @StartDate, @To) + 1 ELSE 0 END;

    -- Today before this time (Dubai) one punch = Present (still at work);
    -- after it, or on any earlier day, one punch = Miss Punch.
    DECLARE @MissPunchAfter TIME = '17:00';
    DECLARE @OpenDay DATE = CASE WHEN CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '+04:00') AS TIME) < @MissPunchAfter
                                 THEN @Today END;   -- NULL after the cutoff

    WITH days AS (
        SELECT TOP (@DayCount) D = DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, @StartDate)
        FROM sys.all_objects a CROSS JOIN sys.all_objects b
    ),
    reg AS (SELECT * FROM dbo.fn_HikAtt_Registered(@TenantId)),
    p AS (
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
    anyp AS (
        SELECT DISTINCT EmpNo, PunchDate
        FROM dbo.HikAttRawPunch
        WHERE TenantId = @TenantId AND PunchDate BETWEEN @StartDate AND @To
    ),
    absent AS (
        SELECT r.EmpNo, EmpName = r.NameOnDevice, PunchDate = dd.D
        FROM reg r CROSS JOIN days dd
        WHERE (r.StartDate IS NULL OR dd.D >= r.StartDate)
          AND NOT EXISTS (SELECT 1 FROM anyp a WHERE a.EmpNo = r.EmpNo AND a.PunchDate = dd.D)
    ),
    allrows AS (
        SELECT EmpNo, EmpName, PunchDate, FirstPunch, LastPunch, PunchCount, MinVerify, MaxVerify,
               Status = CASE WHEN PunchCount = 1 AND (@OpenDay IS NULL OR PunchDate <> @OpenDay)
                             THEN 'MissPunch' ELSE 'Present' END
        FROM d
        UNION ALL
        SELECT EmpNo, EmpName, PunchDate,
               CAST(NULL AS DATETIMEOFFSET), CAST(NULL AS DATETIMEOFFSET), 0, NULL, NULL, 'Absent'
        FROM absent
    ),
    link AS (
        SELECT m.EmpNo, l.EmployeeID2, l.EmployeeCode, l.EmployeeName
        FROM (SELECT DISTINCT EmpNo FROM allrows) m
        OUTER APPLY dbo.fn_HikAtt_EmployeeLink(@TenantId, m.EmpNo) l
    ),
    f AS (
        SELECT a.*, k.EmployeeID2, k.EmployeeCode, k.EmployeeName
        FROM allrows a
        JOIN link k ON k.EmpNo = a.EmpNo
        WHERE @Search IS NULL
           OR a.EmpNo        LIKE '%' + @Search + '%'
           OR a.EmpName      LIKE '%' + @Search + '%'
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
        Method        = CASE WHEN PunchCount = 0 THEN NULL
                             WHEN MinVerify <> MaxVerify THEN 'Mixed'
                             WHEN MinVerify = 75 THEN 'Face'
                             WHEN MinVerify = 38 THEN 'Fingerprint'
                             WHEN MinVerify = 1  THEN 'Card'
                             ELSE 'Other' END,
        Status,
        TotalRows     = COUNT(*) OVER ()
    FROM f
    WHERE @Status IS NULL OR Status = @Status
    ORDER BY PunchDate DESC,
             CASE Status WHEN 'Absent' THEN 1 ELSE 0 END,   -- punched first, absent after
             FirstPunch DESC,
             COALESCE(EmployeeName, EmpName, EmpNo)
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

/* ---------------------------------------------------------------------
   7. Add / update / deactivate a machine person by hand
      (enrolled on the machine but never punched, or removed from it)
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_HikAtt_SaveDevicePerson
    @TenantId     NVARCHAR(65),
    @EmpNo        VARCHAR(30),
    @NameOnDevice NVARCHAR(100) = NULL,
    @ActiveFrom   DATE          = NULL,   -- count Absent from this date
    @IsActive     BIT           = 1       -- 0 = removed from machine
AS
BEGIN
    SET NOCOUNT ON;

    SET @EmpNo = NULLIF(LTRIM(RTRIM(@EmpNo)), '');
    IF @EmpNo IS NULL
        THROW 50140, N'Device person ID is required.', 1;

    UPDATE dbo.HikDevicePerson
    SET NameOnDevice = COALESCE(@NameOnDevice, NameOnDevice),
        ActiveFrom   = COALESCE(@ActiveFrom, ActiveFrom),
        IsActive     = @IsActive
    WHERE TenantId = @TenantId AND EmpNo = @EmpNo;

    IF @@ROWCOUNT = 0
        INSERT dbo.HikDevicePerson (TenantId, EmpNo, NameOnDevice, ActiveFrom, IsActive, Source)
        VALUES (@TenantId, @EmpNo, @NameOnDevice, @ActiveFrom, @IsActive, 'Manual');
END
GO

/* ---------------------------------------------------------------------
   8. Checks / manual use

   -- Everyone counted as registered (should match the machine's user count):
   SELECT * FROM dbo.fn_HikAtt_Registered(N'<tenant ID2>') ORDER BY IsLinked DESC, EmpNo;

   -- Person enrolled on the machine but never punched:
   EXEC dbo.usp_HikAtt_SaveDevicePerson @TenantId = N'<tenant ID2>', @EmpNo = '7',
        @NameOnDevice = N'Ahmed', @ActiveFrom = '2026-11-01';

   -- Person removed from the machine (stops counting as Absent):
   EXEC dbo.usp_HikAtt_SaveDevicePerson @TenantId = N'<tenant ID2>', @EmpNo = '7', @IsActive = 0;
   --------------------------------------------------------------------- */
