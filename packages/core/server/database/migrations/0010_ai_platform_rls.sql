-- KI-Verbrauch und nachgekaufte Credits: Admins lesen die ihrer Organisation, Nutzer die eigenen, Plattform-Admins alle.
-- Geschrieben wird nur ohne RLS (Server zählt den Verbrauch, Abgleich mit klonk.* trägt Credits ein).
GRANT SELECT ON ai_usage TO klonk_user;
--> statement-breakpoint
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_usage_select ON ai_usage FOR SELECT TO klonk_user
  USING (
    user_id = klonk.current_user_id()
    OR (organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'admin')
    OR klonk.is_platform_admin()
  );
--> statement-breakpoint
GRANT SELECT ON ai_credit_grants TO klonk_user;
--> statement-breakpoint
ALTER TABLE ai_credit_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_credit_grants_select ON ai_credit_grants FOR SELECT TO klonk_user
  USING (
    user_id = klonk.current_user_id()
    OR (organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'admin')
    OR klonk.is_platform_admin()
  );
