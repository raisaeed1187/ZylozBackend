USE [Allbiz]
GO

-- Marketplace visibility for the "Submit to Agency" picker (AgencySelector.jsx).
-- Unlike usp_Mazdoor_Agency_List (a Requester's own private, tenant-scoped
-- roster), this also surfaces agencies that self-registered via the public
-- portal: each one is its own independent tenant (see createPortalTenant in
-- _shared.js), identified here by having a Users login whose AgencyId/TenantId
-- point back at itself.
CREATE OR ALTER PROCEDURE [dbo].[usp_Mazdoor_Agency_ListForAssignment]
    @TenantID NVARCHAR(65)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT [ID2],[AgencyName],[AgencyType],[LicenseNumber],[CountryOfRegistration],
           [ContactPerson],[Email],[Phone],[City],[StatusId],[CreatedAt]
    FROM [dbo].[MazdoorAgency] ma
    WHERE ma.[IsDeleted] = 0 AND ma.[StatusId] = 'Active'
      AND (
            ma.[TenantID] = @TenantID
            OR EXISTS (SELECT 1 FROM [dbo].[Users] u WHERE u.[AgencyId] = ma.[ID2] AND u.[TenantId] = ma.[TenantID])
          )
    ORDER BY ma.[AgencyName];
END
GO
