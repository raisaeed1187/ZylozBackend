/* =====================================================================
   Hikvision Attendance - step 3: "Link to system employee" in the
   Machine Attendance Report popup.
   Run in the same database as Hik_Attendance_2_Setup.sql.
   Safe to run more than once.

   1. usp_Employee_SetHikPersonId gets @Reassign (used by "Change": moves
      the device ID from the employee who has it now). Same as in
      Hik_Attendance_2_Setup.sql, repeated here so this file is enough.
   2. usp_HikAtt_SearchEmployees for the employee picker.
   ===================================================================== */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Employee_SetHikPersonId
    @TenantId     NVARCHAR(65),
    @EmployeeID2  NVARCHAR(65),
    @HikPersonId  VARCHAR(30) = NULL,   -- NULL = unlink
    @Reassign     BIT         = 0       -- 1 = move the ID from the employee who has it now
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

    COMMIT;
END
GO

/* Current revision of each employee, top 20 matches on code or name,
   with the device ID they are linked to now (if any). */
CREATE OR ALTER PROCEDURE dbo.usp_HikAtt_SearchEmployees
    @TenantId NVARCHAR(65),
    @Search   NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), '');

    WITH cur AS (
        SELECT e.ID2, e.employeeId, e.name, e.isDeleted,
               rn = ROW_NUMBER() OVER (PARTITION BY e.ID2 ORDER BY ISNULL(e.RevisionNo, 0) DESC)
        FROM dbo.Employee e
        WHERE e.TenantId = @TenantId
    ),
    link AS (
        SELECT ID2, HikPersonId = MAX(HikPersonId)
        FROM dbo.Employee
        WHERE TenantId = @TenantId AND HikPersonId IS NOT NULL
        GROUP BY ID2
    )
    SELECT TOP (20)
        c.ID2        AS EmployeeID2,
        c.employeeId AS EmployeeCode,
        c.name       AS EmployeeName,
        l.HikPersonId
    FROM cur c
    LEFT JOIN link l ON l.ID2 = c.ID2
    WHERE c.rn = 1
      AND ISNULL(c.isDeleted, 0) = 0
      AND (@Search IS NULL
           OR c.employeeId LIKE '%' + @Search + '%'
           OR c.name       LIKE '%' + @Search + '%')
    ORDER BY CASE WHEN c.employeeId = @Search THEN 0 ELSE 1 END, c.name;
END
GO
