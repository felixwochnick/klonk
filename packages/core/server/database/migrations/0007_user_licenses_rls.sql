-- Privat-Lizenzen: Konto liest die eigene, Plattform-Admins alle; geschrieben wird nur ohne RLS (Abgleich mit klonk.*)
GRANT SELECT ON user_licenses TO klonk_user;
--> statement-breakpoint
ALTER TABLE user_licenses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_licenses_select ON user_licenses FOR SELECT TO klonk_user
  USING (user_id = klonk.current_user_id() OR klonk.is_platform_admin());
