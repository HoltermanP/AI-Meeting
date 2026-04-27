-- AppConfig: deployment-level sleutel/waarde instellingen
CREATE TABLE "AppConfig" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- Template: overlegtype-velden
ALTER TABLE "Template" ADD COLUMN "goal"                  TEXT;
ALTER TABLE "Template" ADD COLUMN "defaultAgenda"         TEXT;
ALTER TABLE "Template" ADD COLUMN "aiContextInstructions" TEXT;
ALTER TABLE "Template" ADD COLUMN "outputFocus"           TEXT;

-- Project: overlegtype koppeling + Planner + SharePoint + Teams webhook
ALTER TABLE "Project" ADD COLUMN "templateId"           TEXT;
ALTER TABLE "Project" ADD COLUMN "plannerPlanId"         TEXT;
ALTER TABLE "Project" ADD COLUMN "plannerBucketId"       TEXT;
ALTER TABLE "Project" ADD COLUMN "sharePointSiteId"      TEXT;
ALTER TABLE "Project" ADD COLUMN "sharePointDriveId"     TEXT;
ALTER TABLE "Project" ADD COLUMN "sharePointFolderPath"  TEXT;
ALTER TABLE "Project" ADD COLUMN "teamsWebhookUrl"       TEXT;

ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "Template"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ActionItem: Planner task ID
ALTER TABLE "ActionItem" ADD COLUMN "plannerTaskId" TEXT;
