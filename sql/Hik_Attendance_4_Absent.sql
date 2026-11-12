/* =====================================================================
   Hikvision Attendance - step 4: Registered employees + Absent
   Run in the same database as Hik_Attendance_2_Setup.sql.
   Safe to run more than once. Replaces usp_HikAtt_GetSummary and
   usp_HikAtt_GetDaily from step 2.

   Registered = employee linked to a device ID (Employee.HikPersonId),
                current revision not deleted.
   Per registered employee per day:
       2+ punches  -> Present
       1 punch     -> MissPunch
       no punch    -> Absent   (on any machine)
   Absent is counted only up to today (Dubai) and from the joining date.
   Weekends, leave and holidays are NOT excluded yet.
   ===================================================================== */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------------
   1. Registered employees (current revision, linked, not deleted)
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
    SELECT c.ID2        AS EmployeeID2,
           c.employeeId AS EmployeeCode,
           c.name       AS EmployeeName,
           k.HikPersonId,
           JoiningDate  = TRY_CONVERT(DATE, c.joiningDate)
    FROM cur c
    JOIN k ON k.ID2 = c.ID2
    WHERE c.rn = 1
      AND ISNULL(c.isDeleted, 0) = 0;
GO

/* ---------------------------------------------------------------------
   2. Summary strip
   With a device filter, Present / Miss Punch count that machine only;
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
        SELECT r.HikPersonId, d.D
        FROM reg r CROSS JOIN days d
        WHERE r.JoiningDate IS NULL OR d.D >= r.JoiningDate
    )
    SELECT
        RegisteredEmployees = (SELECT COUNT(*) FROM reg),
        Days                = @DayCount,
        ExpectedDays        = (SELECT COUNT(*) FROM expected),
        PresentDays         = (SELECT COUNT(*) FROM pd WHERE pd.Punches > 1
                                 AND EXISTS (SELECT 1 FROM reg r WHERE r.HikPersonId = pd.EmpNo)),
        MissPunchDays       = (SELECT COUNT(*) FROM pd WHERE pd.Punches = 1
                                 AND EXISTS (SELECT 1 FROM reg r WHERE r.HikPersonId = pd.EmpNo)),
        AbsentDays          = (SELECT COUNT(*) FROM expected e
                               WHERE NOT EXISTS (SELECT 1 FROM anyp a WHERE a.EmpNo = e.HikPersonId AND a.PunchDate = e.D)),
        UnlinkedEmployees   = (SELECT COUNT(DISTINCT p.EmpNo) FROM p
                               WHERE NOT EXISTS (SELECT 1 FROM dbo.Employee e
                                                 WHERE e.TenantId = @TenantId AND e.HikPersonId = p.EmpNo)),
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
   3. Daily view: punch rows (Present / MissPunch) + Absent rows
   Not-linked device people still show their punch rows (never Absent).
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
        SELECT EmpNo = r.HikPersonId, PunchDate = dd.D
        FROM reg r CROSS JOIN days dd
        WHERE (r.JoiningDate IS NULL OR dd.D >= r.JoiningDate)
          AND NOT EXISTS (SELECT 1 FROM anyp a WHERE a.EmpNo = r.HikPersonId AND a.PunchDate = dd.D)
    ),
    allrows AS (
        SELECT EmpNo, EmpName, PunchDate, FirstPunch, LastPunch, PunchCount, MinVerify, MaxVerify,
               Status = CASE WHEN PunchCount = 1 THEN 'MissPunch' ELSE 'Present' END
        FROM d
        UNION ALL
        SELECT EmpNo, CAST(NULL AS NVARCHAR(100)), PunchDate,
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
             EmployeeName
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO
