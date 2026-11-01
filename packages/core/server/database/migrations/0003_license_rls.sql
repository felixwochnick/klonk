-- Instanz-Einstellungen (u. a. Lizenz-Token): nur Plattform-Admins
GRANT SELECT, INSERT, UPDATE, DELETE ON instance_settings TO klonk_user;
--> statement-breakpoint
ALTER TABLE instance_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY instance_settings_platform ON instance_settings FOR ALL TO klonk_user
  USING (klonk.is_platform_admin())
  WITH CHECK (klonk.is_platform_admin());
--> statement-breakpoint
-- organizations.license_token: Spalte ist über die bestehenden Policies abgedeckt
-- (lesen alle Mitglieder, ändern nur Admins der Organisation und Plattform-Admins)
SELECT 1;
