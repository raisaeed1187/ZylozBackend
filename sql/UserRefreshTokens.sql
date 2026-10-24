USE [Allbiz]
GO

-- Refresh tokens for the mobile app (see signIn / refreshToken in authController.js).
-- Only a SHA-256 hash of each token is stored, never the token itself.
-- Tokens are rotated on every refresh (old row gets RevokedAt) and expire
-- 30 days after their last use. To log out a device, set RevokedAt on its rows:
--   UPDATE dbo.UserRefreshTokens SET RevokedAt = GETDATE()
--   WHERE DeviceName = 'Attendance Tablet' AND RevokedAt IS NULL;
IF OBJECT_ID(N'[dbo].[UserRefreshTokens]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[UserRefreshTokens] (
        [Id]         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [TokenHash]  CHAR(64)       NOT NULL,
        [UserID2]    NVARCHAR(65)   NOT NULL,
        [Email]      NVARCHAR(256)  NOT NULL,
        [DeviceName] NVARCHAR(100)  NULL,
        [ExpiresAt]  DATETIME       NOT NULL,
        [CreatedAt]  DATETIME       NOT NULL DEFAULT GETDATE(),
        [LastUsedAt] DATETIME       NULL,
        [RevokedAt]  DATETIME       NULL
    );

    CREATE UNIQUE INDEX [UX_UserRefreshTokens_TokenHash]
        ON [dbo].[UserRefreshTokens] ([TokenHash]);

    CREATE INDEX [IX_UserRefreshTokens_UserID2]
        ON [dbo].[UserRefreshTokens] ([UserID2]);
END
GO

-- Stores a newly issued refresh token (issueRefreshToken in authController.js).
CREATE OR ALTER PROCEDURE [dbo].[usp_UserRefreshToken_Insert]
    @TokenHash  CHAR(64),
    @UserID2    NVARCHAR(65),
    @Email      NVARCHAR(256),
    @DeviceName NVARCHAR(100) = NULL,
    @Days       INT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO [dbo].[UserRefreshTokens] ([TokenHash],[UserID2],[Email],[DeviceName],[ExpiresAt])
    VALUES (@TokenHash, @UserID2, @Email, @DeviceName, DATEADD(DAY, @Days, GETDATE()));
END
GO

-- Claims (revokes) a refresh token in one statement so it can be used only once
-- (refreshAccessToken in authController.js). Returns no rows if the token is
-- unknown, expired or already used.
CREATE OR ALTER PROCEDURE [dbo].[usp_UserRefreshToken_Claim]
    @TokenHash CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [dbo].[UserRefreshTokens]
    SET    [RevokedAt] = GETDATE(), [LastUsedAt] = GETDATE()
    OUTPUT INSERTED.[UserID2], INSERTED.[Email], INSERTED.[DeviceName]
    WHERE  [TokenHash] = @TokenHash AND [RevokedAt] IS NULL AND [ExpiresAt] > GETDATE();
END
GO
