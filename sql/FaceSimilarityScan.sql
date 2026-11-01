/*
  Face enrollment health check — READ ONLY (only temp tables, nothing is changed).

  Result 1: each employee's own photos should look alike.
            Low "LowestOwnSimilarity" = a bad photo (blurry, dark, side-on,
            someone else) → re-enroll that employee.
  Result 2: different employees should NOT look alike.
            HIGH (>= 62%) = they can be matched as each other at check-in
            → re-enroll both with clear photos.

  Set @TenantId below, then run the whole script.
*/
USE [Allbiz];
SET NOCOUNT ON;

DECLARE @TenantId   NVARCHAR(65) = N'PUT-TENANT-ID-HERE';
DECLARE @PairAlert  FLOAT = 0.50;   -- show look-alike pairs from this similarity
DECLARE @SelfAlert  FLOAT = 0.50;   -- own photos less alike than this = bad photo

EXEC sp_set_session_context @key = N'TenantId', @value = @TenantId;

IF OBJECT_ID('tempdb..#Photo') IS NOT NULL DROP TABLE #Photo;
IF OBJECT_ID('tempdb..#Vec')   IS NOT NULL DROP TABLE #Vec;
IF OBJECT_ID('tempdb..#Norm')  IS NOT NULL DROP TABLE #Norm;
IF OBJECT_ID('tempdb..#Sim')   IS NOT NULL DROP TABLE #Sim;

-- All enrolled photos of active employees in this tenant
SELECT  ROW_NUMBER() OVER (ORDER BY e.EmployeeId, f.CreatedAt)                     AS PhotoId,
        ROW_NUMBER() OVER (PARTITION BY e.EmployeeId ORDER BY f.CreatedAt)          AS PhotoNo,
        e.EmployeeId, e.Name, e.EmployeeCode, f.QualityScore, f.CreatedAt, f.Embedding
INTO    #Photo
FROM    AttendanceEmployees e
JOIN    FaceEmbeddings f ON e.EmployeeId = f.EmployeeId
WHERE   e.IsActive = 1 AND e.TenantId = @TenantId;

-- Split each 512-number face fingerprint into rows
SELECT  p.PhotoId, CAST(j.[key] AS INT) AS Idx, CAST(j.[value] AS FLOAT) AS Val
INTO    #Vec
FROM    #Photo p
CROSS APPLY OPENJSON(p.Embedding) j;

CREATE CLUSTERED INDEX IX_Vec ON #Vec (Idx, PhotoId);

SELECT PhotoId, SQRT(SUM(Val * Val)) AS Norm
INTO   #Norm
FROM   #Vec
GROUP  BY PhotoId;

-- Cosine similarity of every pair of photos (same calculation as check-in)
SELECT  a.PhotoId AS PhotoA, b.PhotoId AS PhotoB, SUM(a.Val * b.Val) AS Dot
INTO    #Sim
FROM    #Vec a
JOIN    #Vec b ON b.Idx = a.Idx AND b.PhotoId > a.PhotoId
GROUP   BY a.PhotoId, b.PhotoId;

ALTER TABLE #Sim ADD Similarity FLOAT;
UPDATE s SET Similarity = s.Dot / NULLIF(na.Norm * nb.Norm, 0)
FROM   #Sim s
JOIN   #Norm na ON na.PhotoId = s.PhotoA
JOIN   #Norm nb ON nb.PhotoId = s.PhotoB;

DECLARE @Employees INT, @Photos INT;
SELECT @Employees = COUNT(DISTINCT EmployeeId), @Photos = COUNT(*) FROM #Photo;
PRINT CONCAT('Employees: ', @Employees, ', photos: ', @Photos);

-- ── Result 1: own photos consistency ─────────────────────────────────────────
;WITH Own AS (
    SELECT  pa.EmployeeId, pa.PhotoNo AS PhotoX, pb.PhotoNo AS PhotoY, s.Similarity,
            ROW_NUMBER() OVER (PARTITION BY pa.EmployeeId ORDER BY s.Similarity) AS rn
    FROM    #Sim s
    JOIN    #Photo pa ON pa.PhotoId = s.PhotoA
    JOIN    #Photo pb ON pb.PhotoId = s.PhotoB
    WHERE   pa.EmployeeId = pb.EmployeeId
), Emp AS (
    SELECT EmployeeId, MIN(Name) AS Name, MIN(EmployeeCode) AS EmployeeCode,
           COUNT(*) AS Photos, MIN(QualityScore) AS LowestQuality
    FROM   #Photo
    GROUP  BY EmployeeId
)
SELECT  e.Name, e.EmployeeCode, e.Photos,
        ROUND(o.Similarity * 100, 1)               AS LowestOwnSimilarityPct,
        CONCAT('#', o.PhotoX, ' vs #', o.PhotoY)   AS WorstPhotoPair,
        ROUND(e.LowestQuality, 3)                  AS LowestQuality,
        CASE
            WHEN e.Photos < 2               THEN 'Only 1 photo - re-enroll with 3-5 photos'
            WHEN o.Similarity < @SelfAlert  THEN 'BAD PHOTO - re-enroll'
            ELSE 'OK'
        END AS Status
FROM    Emp e
LEFT JOIN Own o ON o.EmployeeId = e.EmployeeId AND o.rn = 1
ORDER BY CASE WHEN e.Photos < 2 OR o.Similarity < @SelfAlert THEN 0 ELSE 1 END,
         o.Similarity;

-- ── Result 2: different employees that look alike ────────────────────────────
SELECT  pa.Name AS EmployeeA, pa.EmployeeCode AS CodeA,
        pb.Name AS EmployeeB, pb.EmployeeCode AS CodeB,
        ROUND(MAX(s.Similarity) * 100, 1) AS BestSimilarityPct,
        CASE WHEN MAX(s.Similarity) >= 0.62
             THEN 'HIGH - can be confused, re-enroll both'
             ELSE 'Check' END AS Status
FROM    #Sim s
JOIN    #Photo pa ON pa.PhotoId = s.PhotoA
JOIN    #Photo pb ON pb.PhotoId = s.PhotoB
WHERE   pa.EmployeeId <> pb.EmployeeId
GROUP   BY pa.EmployeeId, pa.Name, pa.EmployeeCode, pb.EmployeeId, pb.Name, pb.EmployeeCode
HAVING  MAX(s.Similarity) >= @PairAlert
ORDER BY BestSimilarityPct DESC;

DROP TABLE #Sim; DROP TABLE #Norm; DROP TABLE #Vec; DROP TABLE #Photo;
