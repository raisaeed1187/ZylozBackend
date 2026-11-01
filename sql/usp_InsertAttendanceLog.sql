USE [Allbiz]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER PROCEDURE [dbo].[usp_InsertAttendanceLog]
    @EmployeeId   INT,
    @EmployeeID2  NVARCHAR(65),
    @TenantId     NVARCHAR(65),
    @Type         NVARCHAR(10),
    @Method       NVARCHAR(20),
    @Location     NVARCHAR(200),
    @ProjectID    NVARCHAR(65),
    @Latitude     NVARCHAR(65),
    @Longitude    NVARCHAR(65),
    @Confidence   FLOAT
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiosk voice message after a successful punch:
    --   1 = "Thank you, {name}. Check in/out successful."
    --   0 = "Thank you. Check in/out successful."
    -- Change this value and re-run the script; no backend or app release needed.
    DECLARE @SoundWithName BIT = 1;

    DECLARE @Inserted TABLE (LogId INT);

    INSERT INTO AttendanceLogs
        (EmployeeId, EmployeeID2, TenantId, Type, Method, Location, ProjectID, Latitude, Longitude, Confidence, LogTime)
    OUTPUT INSERTED.LogId INTO @Inserted (LogId)
    VALUES
        (@EmployeeId, @EmployeeID2, @TenantId, @Type, @Method, @Location, @ProjectID, @Latitude, @Longitude, @Confidence, GETDATE());

    SELECT LogId, @SoundWithName AS SoundWithName
    FROM @Inserted;
END
GO
