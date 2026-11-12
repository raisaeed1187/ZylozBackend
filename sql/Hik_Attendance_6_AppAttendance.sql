/* =====================================================================
   Hikvision Attendance - step 6: machine + mobile app (face / biometric)
   attendance together in the Machine Attendance Report.
   Run in the same database, AFTER Hik_Attendance_5_DevicePersons.sql.
   Safe to run more than once. Replaces fn_HikAtt_Registered,
   usp_HikAtt_GetSummary, usp_HikAtt_GetDaily, usp_HikAtt_GetPunches.

   One person per row and day:
     PersonKey = Employee.ID2       system employee (app punches, and machine
                                    punches of a linked device ID)
               = 'HIK:' + EmpNo     machine person not linked to an employee
   So an employee who punches on the machine AND in the app gets ONE row.

   Rules (both sources together): first punch = In, last punch = Out
     2+ punches -> Present
     1 punch    -> Miss Punch (today before 5 PM Dubai: Present)
     no punch   -> Absent (only for the people in "Employees")

   Employees = machine people (linked or not)
             + employees who have ever punched in the mobile app
             excluding deleted employees and status 11 (as in
             usp_Attendance_GetListView).

   AttendanceLogs.LogTime is taken as Dubai local time (same as
   usp_Attendance_GetListView: CAST(LogTime AS DATE)).
   ===================================================================== */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------------
   1. All punches of both sources, one shape
   --------------------------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_HikAtt_AllPunches (@TenantId NVARCHAR(65), @StartDate DATE, @EndDate DATE)
RETURNS TABLE
AS
RETURN
    -- machine
    SELECT PunchId      = CAST('M' + CAST(p.Id AS VARCHAR(20)) AS VARCHAR(25)),
           PersonKey    = CAST(COALESCE(k.ID2, N'HIK:' + p.EmpNo) AS NVARCHAR(100)),
           EmployeeID2  = CAST(k.ID2 AS NVARCHAR(65)),
           EmpNo        = p.EmpNo,
           EmpName      = p.EmpName,
           PunchDate    = p.PunchDate,
           PunchLocal   = CAST(SWITCHOFFSET(p.PunchTime, '+04:00') AS DATETIME2(0)),
           Method       = CAST(CASE p.VerifyMinor WHEN 75 THEN 'Face' WHEN 38 THEN 'Fingerprint' WHEN 1 THEN 'Card' ELSE 'Other' END AS NVARCHAR(30)),
           Source       = CAST('Machine' AS VARCHAR(10)),
           DeviceId     = p.DeviceId,
           Place        = CAST(d.DeviceName AS NVARCHAR(120)),
           DeviceSerial = d.DeviceSerial,
           Latitude     = CAST(NULL AS NVARCHAR(65)),
           Longitude    = CAST(NULL AS NVARCHAR(65))
    FROM dbo.HikAttRawPunch p
    JOIN dbo.HikDevices d ON d.DeviceId = p.DeviceId
    OUTER APPLY (SELECT TOP (1) e.ID2
                 FROM dbo.Employee e
                 WHERE e.TenantId = @TenantId AND e.HikPersonId = p.EmpNo
                 ORDER BY ISNULL(e.RevisionNo, 0) DESC) k
    WHERE p.TenantId = @TenantId
      AND p.PunchDate BETWEEN @StartDate AND @EndDate
    UNION ALL
    -- mobile app (face / biometric)
    SELECT CAST('A' + CAST(a.LogId AS VARCHAR(20)) AS VARCHAR(25)),
           CAST(a.EmployeeID2 AS NVARCHAR(100)),
           CAST(a.EmployeeID2 AS NVARCHAR(65)),
           CAST(NULL AS VARCHAR(30)),
           CAST(NULL AS NVARCHAR(100)),
           CAST(a.LogTime AS DATE),
           CAST(a.LogTime AS DATETIME2(0)),
           CAST(ISNULL(a.Method, 'Other') AS NVARCHAR(30)),
           CAST('App' AS VARCHAR(10)),
           CAST(NULL AS INT),
           CAST(a.Location AS NVARCHAR(120)),
           CAST(NULL AS VARCHAR(50)),
           CAST(a.Latitude AS NVARCHAR(65)),
           CAST(a.Longitude AS NVARCHAR(65))
    FROM dbo.AttendanceLogs a
    WHERE a.TenantId = @TenantId
      AND a.EmployeeID2 IS NOT NULL
      AND a.LogTime >= @StartDate
      AND a.LogTime <  DATEADD(DAY, 1, @EndDate);
GO

/* ---------------------------------------------------------------------
   2. Employees counted in the report (expected to punch)
   --------------------------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_HikAtt_Registered (@TenantId NVARCHAR(65))
RETURNS TABLE
AS
RETURN
    WITH cur AS (
        SELECT e.ID2, e.employeeId, e.name, e.isDeleted, e.status, e.joiningDate,
               rn = ROW_NUMBER() OVER (PARTITION BY e.ID2 ORDER BY ISNULL(e.RevisionNo, 0) DESC)
        FROM dbo.Employee e
        WHERE e.TenantId = @TenantId
    ),
    k AS (
        SELECT ID2, HikPersonId = MAX(HikPersonId)
        FROM dbo.Employee
        WHERE TenantId = @TenantId AND HikPersonId IS NOT NULL
        GROUP BY ID2
    ),
    app AS (
        SELECT DISTINCT EmployeeID2
        FROM dbo.AttendanceLogs
        WHERE TenantId = @TenantId AND EmployeeID2 IS NOT NULL
    )
    -- system employees: linked to the machine and/or using the app
    SELECT PersonKey    = CAST(c.ID2 AS NVARCHAR(100)),
           EmpNo        = k.HikPersonId,
           EmployeeID2  = CAST(c.ID2 AS NVARCHAR(65)),
           EmployeeCode = c.employeeId,
           EmployeeName = c.name,
           NameOnDevice = CAST(NULL AS NVARCHAR(100)),
           StartDate    = TRY_CONVERT(DATE, c.joiningDate),
           IsLinked     = CAST(1 AS BIT),
           OnMachine    = CAST(CASE WHEN k.ID2 IS NULL THEN 0 ELSE 1 END AS BIT),
           UsesApp      = CAST(CASE WHEN app.EmployeeID2 IS NULL THEN 0 ELSE 1 END AS BIT)
    FROM cur c
    LEFT JOIN k   ON k.ID2 = c.ID2
    LEFT JOIN app ON app.EmployeeID2 = c.ID2
    WHERE c.rn = 1
      AND ISNULL(c.isDeleted, 0) = 0
      AND ISNULL(c.status, 0) <> 11
      AND (k.ID2 IS NOT NULL OR app.EmployeeID2 IS NOT NULL)
    UNION ALL
    -- machine people not linked to any employee
    SELECT CAST(N'HIK:' + dp.EmpNo AS NVARCHAR(100)),
           dp.EmpNo, NULL, NULL, NULL,
           dp.NameOnDevice,
           COALESCE(dp.ActiveFrom, CAST(SWITCHOFFSET(dp.FirstSeenAt, '+04:00') AS DATE)),
           CAST(0 AS BIT), CAST(1 AS BIT), CAST(0 AS BIT)
    FROM dbo.HikDevicePerson dp
    WHERE dp.TenantId = @TenantId
      AND dp.IsActive = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.Employee e
                      WHERE e.TenantId = @TenantId AND e.HikPersonId = dp.EmpNo);
GO

/* ---------------------------------------------------------------------
   3. Summary strip
   With a device filter only that machine's punches count (no app punches);
   Absent always means no punch at all (machine or app).
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
    ap AS (
        SELECT * FROM dbo.fn_HikAtt_AllPunches(@TenantId, @StartDate, @EndDate)
        WHERE @DeviceId IS NULL OR DeviceId = @DeviceId
    ),
    pd AS (SELECT PersonKey, PunchDate, Punches = COUNT(*) FROM ap GROUP BY PersonKey, PunchDate),
    anyp AS (SELECT DISTINCT PersonKey, PunchDate FROM dbo.fn_HikAtt_AllPunches(@TenantId, @StartDate, @To)),
    expected AS (
        SELECT r.PersonKey, d.D
        FROM reg r CROSS JOIN days d
        WHERE r.StartDate IS NULL OR d.D >= r.StartDate
    )
    SELECT
        RegisteredEmployees = (SELECT COUNT(*) FROM reg),
        LinkedEmployees     = (SELECT COUNT(*) FROM reg WHERE IsLinked = 1),
        UnlinkedEmployees   = (SELECT COUNT(*) FROM reg WHERE IsLinked = 0),
        MachineEmployees    = (SELECT COUNT(*) FROM reg WHERE OnMachine = 1),
        AppEmployees        = (SELECT COUNT(*) FROM reg WHERE UsesApp = 1),
        Days                = @DayCount,
        ExpectedDays        = (SELECT COUNT(*) FROM expected),
        PresentDays         = (SELECT COUNT(*) FROM pd
                               WHERE (pd.Punches > 1 OR (pd.Punches = 1 AND pd.PunchDate = @OpenDay))
                                 AND EXISTS (SELECT 1 FROM reg r WHERE r.PersonKey = pd.PersonKey)),
        MissPunchDays       = (SELECT COUNT(*) FROM pd
                               WHERE pd.Punches = 1 AND (@OpenDay IS NULL OR pd.PunchDate <> @OpenDay)
                                 AND EXISTS (SELECT 1 FROM reg r WHERE r.PersonKey = pd.PersonKey)),
        AbsentDays          = (SELECT COUNT(*) FROM expected e
                               WHERE NOT EXISTS (SELECT 1 FROM anyp a WHERE a.PersonKey = e.PersonKey AND a.PunchDate = e.D)),
        TotalPunches        = (SELECT COUNT(*) FROM ap),
        MachinePunches      = (SELECT COUNT(*) FROM ap WHERE Source = 'Machine'),
        AppPunches          = (SELECT COUNT(*) FROM ap WHERE Source = 'App'),
        FaceCount           = (SELECT COUNT(*) FROM ap WHERE Method = 'Face'),
        FingerprintCount    = (SELECT COUNT(*) FROM ap WHERE Method IN ('Fingerprint', 'Bio')),
        CardCount           = (SELECT COUNT(*) FROM ap WHERE Method IN ('Card', 'NFC')),
        Devices             = (SELECT COUNT(*) FROM dbo.HikDevices WHERE TenantId = @TenantId AND IsActive = 1),
        LastActivity        = (SELECT CONVERT(VARCHAR(16), CAST(SWITCHOFFSET(CAST(MAX(LastSeenAt) AS DATETIMEOFFSET), '+04:00') AS DATETIME2), 120)
                               FROM dbo.HikDevices WHERE TenantId = @TenantId);
END
GO

/* ---------------------------------------------------------------------
   4. Daily view: one row per person per day (machine + app together),
      plus Absent rows
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
    ap AS (
        SELECT * FROM dbo.fn_HikAtt_AllPunches(@TenantId, @StartDate, @EndDate)
        WHERE @DeviceId IS NULL OR DeviceId = @DeviceId
    ),
    d AS (
        SELECT PersonKey, PunchDate,
               EmpNo       = MAX(EmpNo),
               EmpName     = MAX(EmpName),
               EmployeeID2 = MAX(EmployeeID2),
               FirstPunch  = MIN(PunchLocal),
               LastPunch   = MAX(PunchLocal),
               PunchCount  = COUNT(*),
               MinMethod   = MIN(Method),
               MaxMethod   = MAX(Method),
               HasMachine  = MAX(CASE WHEN Source = 'Machine' THEN 1 ELSE 0 END),
               HasApp      = MAX(CASE WHEN Source = 'App'     THEN 1 ELSE 0 END)
        FROM ap
        GROUP BY PersonKey, PunchDate
    ),
    anyp AS (SELECT DISTINCT PersonKey, PunchDate FROM dbo.fn_HikAtt_AllPunches(@TenantId, @StartDate, @To)),
    absent AS (
        SELECT r.PersonKey, r.EmpNo, EmpName = r.NameOnDevice, r.EmployeeID2, PunchDate = dd.D
        FROM reg r CROSS JOIN days dd
        WHERE (r.StartDate IS NULL OR dd.D >= r.StartDate)
          AND NOT EXISTS (SELECT 1 FROM anyp a WHERE a.PersonKey = r.PersonKey AND a.PunchDate = dd.D)
    ),
    allrows AS (
        SELECT PersonKey, EmpNo, EmpName, EmployeeID2, PunchDate, FirstPunch, LastPunch, PunchCount,
               MinMethod, MaxMethod, HasMachine, HasApp,
               Status = CASE WHEN PunchCount = 1 AND (@OpenDay IS NULL OR PunchDate <> @OpenDay)
                             THEN 'MissPunch' ELSE 'Present' END
        FROM d
        UNION ALL
        SELECT PersonKey, EmpNo, EmpName, EmployeeID2, PunchDate,
               CAST(NULL AS DATETIME2(0)), CAST(NULL AS DATETIME2(0)), 0,
               NULL, NULL, 0, 0, 'Absent'
        FROM absent
    ),
    -- current employee row + device ID, once per employee
    emp AS (
        SELECT m.EmployeeID2, cur.employeeId AS EmployeeCode, cur.name AS EmployeeName, hk.HikPersonId
        FROM (SELECT DISTINCT EmployeeID2 FROM allrows WHERE EmployeeID2 IS NOT NULL) m
        OUTER APPLY (SELECT TOP (1) e.employeeId, e.name FROM dbo.Employee e
                     WHERE e.TenantId = @TenantId AND e.ID2 = m.EmployeeID2
                     ORDER BY ISNULL(e.RevisionNo, 0) DESC) cur
        OUTER APPLY (SELECT TOP (1) e.HikPersonId FROM dbo.Employee e
                     WHERE e.TenantId = @TenantId AND e.ID2 = m.EmployeeID2 AND e.HikPersonId IS NOT NULL
                     ORDER BY ISNULL(e.RevisionNo, 0) DESC) hk
    ),
    f AS (
        SELECT a.*, EmpNoShown = COALESCE(a.EmpNo, x.HikPersonId), x.EmployeeCode, x.EmployeeName
        FROM allrows a
        LEFT JOIN emp x ON x.EmployeeID2 = a.EmployeeID2
        WHERE @Search IS NULL
           OR a.EmpNo         LIKE '%' + @Search + '%'
           OR a.EmpName       LIKE '%' + @Search + '%'
           OR x.EmployeeCode  LIKE '%' + @Search + '%'
           OR x.EmployeeName  LIKE '%' + @Search + '%'
    )
    SELECT
        PersonKey,
        EmpNo         = EmpNoShown,
        EmpName,
        EmployeeID2,
        EmployeeCode,
        EmployeeName,
        IsLinked      = CAST(CASE WHEN EmployeeID2 IS NULL THEN 0 ELSE 1 END AS BIT),
        PunchDate     = CONVERT(CHAR(10), PunchDate, 23),
        FirstIn       = CONVERT(CHAR(5), FirstPunch, 108),
        LastOut       = CASE WHEN PunchCount > 1 THEN CONVERT(CHAR(5), LastPunch, 108) END,
        WorkedMinutes = CASE WHEN PunchCount > 1 THEN DATEDIFF(MINUTE, FirstPunch, LastPunch) END,
        PunchCount,
        Method        = CASE WHEN PunchCount = 0 THEN NULL
                             WHEN MinMethod <> MaxMethod THEN 'Mixed'
                             ELSE MinMethod END,
        Source        = CASE WHEN HasMachine = 1 AND HasApp = 1 THEN 'Machine + App'
                             WHEN HasApp = 1     THEN 'App'
                             WHEN HasMachine = 1 THEN 'Machine' END,
        Status,
        TotalRows     = COUNT(*) OVER ()
    FROM f
    WHERE @Status IS NULL OR Status = @Status
    ORDER BY PunchDate DESC,
             CASE Status WHEN 'Absent' THEN 1 ELSE 0 END,   -- punched first, absent after
             FirstPunch DESC,
             COALESCE(EmployeeName, EmpName, EmpNoShown)
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

/* ---------------------------------------------------------------------
   5. All punches (Punches tab) and one person's day (popup: @PersonKey)
   @VerifyMinor kept for the existing filter: 75 Face, 38 Fingerprint, 1 Card
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
    @PageSize    INT           = 50,
    @PersonKey   NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MethodFilter NVARCHAR(30) =
        CASE @VerifyMinor WHEN 75 THEN 'Face' WHEN 38 THEN 'Fingerprint' WHEN 1 THEN 'Card' END;

    WITH ap AS (
        SELECT * FROM dbo.fn_HikAtt_AllPunches(@TenantId, @StartDate, @EndDate)
        WHERE (@DeviceId  IS NULL OR DeviceId  = @DeviceId)
          AND (@PersonKey IS NULL OR PersonKey = @PersonKey)
          AND (@EmpNo     IS NULL OR EmpNo     = @EmpNo)
          AND (@MethodFilter IS NULL
               OR Method = @MethodFilter
               OR (@MethodFilter = 'Fingerprint' AND Method = 'Bio')
               OR (@MethodFilter = 'Card'        AND Method = 'NFC'))
    ),
    emp AS (
        SELECT m.EmployeeID2, cur.employeeId AS EmployeeCode, cur.name AS EmployeeName, hk.HikPersonId
        FROM (SELECT DISTINCT EmployeeID2 FROM ap WHERE EmployeeID2 IS NOT NULL) m
        OUTER APPLY (SELECT TOP (1) e.employeeId, e.name FROM dbo.Employee e
                     WHERE e.TenantId = @TenantId AND e.ID2 = m.EmployeeID2
                     ORDER BY ISNULL(e.RevisionNo, 0) DESC) cur
        OUTER APPLY (SELECT TOP (1) e.HikPersonId FROM dbo.Employee e
                     WHERE e.TenantId = @TenantId AND e.ID2 = m.EmployeeID2 AND e.HikPersonId IS NOT NULL
                     ORDER BY ISNULL(e.RevisionNo, 0) DESC) hk
    )
    SELECT
        Id           = ap.PunchId,
        ap.PersonKey,
        EmpNo        = COALESCE(ap.EmpNo, x.HikPersonId),
        ap.EmpName,
        ap.EmployeeID2,
        x.EmployeeCode,
        x.EmployeeName,
        IsLinked     = CAST(CASE WHEN ap.EmployeeID2 IS NULL THEN 0 ELSE 1 END AS BIT),
        PunchDate    = CONVERT(CHAR(10), ap.PunchDate, 23),
        PunchTime    = CONVERT(CHAR(8), ap.PunchLocal, 108),
        VerifyBy     = ap.Method,
        ap.Source,
        DeviceName   = ap.Place,            -- machine name, or app location
        ap.DeviceSerial,
        ap.Latitude,
        ap.Longitude,
        TotalRows    = COUNT(*) OVER ()
    FROM ap
    LEFT JOIN emp x ON x.EmployeeID2 = ap.EmployeeID2
    WHERE @Search IS NULL
       OR ap.EmpNo        LIKE '%' + @Search + '%'
       OR ap.EmpName      LIKE '%' + @Search + '%'
       OR x.EmployeeCode  LIKE '%' + @Search + '%'
       OR x.EmployeeName  LIKE '%' + @Search + '%'
    ORDER BY ap.PunchLocal DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO
