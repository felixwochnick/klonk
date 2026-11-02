-- KI-Einstellungen: Mitglieder lesen die ihrer Organisation (der Server braucht sie für den Assistenten;
-- der API-Schlüssel ist mit NUXT_ENCRYPTION_KEY verschlüsselt und verlässt den Server nie), ändern nur Admins
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_ai_settings TO klonk_user;
--> statement-breakpoint
ALTER TABLE organization_ai_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organization_ai_settings_select ON organization_ai_settings FOR SELECT TO klonk_user
  USING (organization_id = klonk.current_org_id() OR klonk.is_platform_admin());
--> statement-breakpoint
CREATE POLICY organization_ai_settings_admin ON organization_ai_settings FOR ALL TO klonk_user
  USING ((organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'admin') OR klonk.is_platform_admin())
  WITH CHECK ((organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'admin') OR klonk.is_platform_admin());
