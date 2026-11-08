/* =====================================================================
   Hikvision Attendance - step 1: rename AttRawPunch -> HikAttRawPunch
   Run ONCE in the database that has the Hik tables, BEFORE
   Hik_Attendance_2_Setup.sql. Safe to run again (does nothing then).

   Keeps all data. Also renames the table's unique constraint and index,
   and moves its row-level security predicates to the new name.
   ===================================================================== */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
GO

IF OBJECT_ID('dbo.HikAttRawPunch') IS NOT NULL
BEGIN
    PRINT 'dbo.HikAttRawPunch already exists - nothing to do.';
    RETURN;
END

IF OBJECT_ID('dbo.AttRawPunch') IS NULL
    THROW 50130, N'dbo.AttRawPunch not found in this database.', 1;

BEGIN TRAN;

    -- 1. Remember and remove the table's security predicates (re-added below)
    DECLARE @Preds TABLE (PolicyName NVARCHAR(300), PredType NVARCHAR(10), PredDef NVARCHAR(MAX), Op NVARCHAR(30));

    INSERT @Preds (PolicyName, PredType, PredDef, Op)
    SELECT QUOTENAME(SCHEMA_NAME(sp.schema_id)) + N'.' + QUOTENAME(sp.name),
           pr.predicate_type_desc,
           pr.predicate_definition,
           REPLACE(pr.operation_desc, N'_', N' ')            -- AFTER_INSERT -> AFTER INSERT
    FROM sys.security_predicates pr
    JOIN sys.security_policies sp ON sp.object_id = pr.object_id
    WHERE pr.target_object_id = OBJECT_ID('dbo.AttRawPunch');

    DECLARE @Stmt NVARCHAR(MAX) = N'';
    SELECT @Stmt += N'ALTER SECURITY POLICY ' + PolicyName + N' DROP ' + PredType
                  + N' PREDICATE ON dbo.AttRawPunch' + ISNULL(N' ' + Op, N'') + N';' + CHAR(10)
    FROM @Preds;
    IF @Stmt <> N'' EXEC sp_executesql @Stmt;

    -- 2. Rename table, unique constraint and index
    EXEC sp_rename 'dbo.AttRawPunch', 'HikAttRawPunch';

    IF OBJECT_ID('dbo.UQ_AttRawPunch_DeviceSerial') IS NOT NULL
        EXEC sp_rename 'dbo.UQ_AttRawPunch_DeviceSerial', 'UQ_HikAttRawPunch_DeviceSerial', 'OBJECT';

    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AttRawPunch_Tenant_Date_Emp'
               AND object_id = OBJECT_ID('dbo.HikAttRawPunch'))
        EXEC sp_rename 'dbo.HikAttRawPunch.IX_AttRawPunch_Tenant_Date_Emp', 'IX_HikAttRawPunch_Tenant_Date_Emp', 'INDEX';

    -- 3. Put the security predicates back on the new name
    SET @Stmt = N'';
    SELECT @Stmt += N'ALTER SECURITY POLICY ' + PolicyName + N' ADD ' + PredType + N' PREDICATE '
                  + CASE WHEN LEFT(PredDef, 1) = N'(' AND RIGHT(PredDef, 1) = N')'
                         THEN SUBSTRING(PredDef, 2, LEN(PredDef) - 2) ELSE PredDef END   -- strip outer ( )
                  + N' ON dbo.HikAttRawPunch' + ISNULL(N' ' + Op, N'') + N';' + CHAR(10)
    FROM @Preds;
    IF @Stmt <> N'' EXEC sp_executesql @Stmt;

COMMIT;

PRINT 'Renamed dbo.AttRawPunch to dbo.HikAttRawPunch.';
GO
