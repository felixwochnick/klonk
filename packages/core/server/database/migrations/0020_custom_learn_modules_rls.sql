-- Eigene Lernmodule der Lehrkräfte: Lehrkräfte und Admins der Organisation sehen alle, Lernende die in einer ihrer Gruppen
-- freigegebenen; bearbeiten und löschen dürfen Autor:in und Admins der Organisation
CREATE OR REPLACE FUNCTION klonk.custom_module_org(module text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT organization_id FROM custom_learn_modules WHERE id = module $$;
--> statement-breakpoint
-- Ist das Modul in einer Gruppe des aktuellen Kontos freigegeben?
CREATE OR REPLACE FUNCTION klonk.learn_module_released(module text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM group_members gm JOIN group_learn_modules glm ON glm.group_id = gm.group_id
      WHERE gm.user_id = klonk.current_user_id() AND glm.module_id = module) $$;
--> statement-breakpoint
-- Starten: eingebaute Module wie bisher (Privatkonten und Lehrkräfte/Admins immer, Lernende bei Freigabe); eigene Module nur
-- Lehrkräfte/Admins der Organisation des Moduls und Lernende, in deren Gruppe es freigegeben ist
CREATE OR REPLACE FUNCTION klonk.can_start_learn_module(module text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT CASE WHEN module LIKE 'custom-%'
    THEN klonk.custom_module_org(module) IS NOT NULL
      AND (klonk.is_org_staff(klonk.custom_module_org(module)) OR klonk.learn_module_released(module))
    ELSE klonk.current_org_id() IS NULL
      OR klonk.current_member_role() IN ('teacher', 'admin')
      OR klonk.learn_module_released(module)
  END $$;
--> statement-breakpoint
-- Bearbeiten: Autor:in (solange Lehrkraft/Admin der Organisation) oder Admin der Organisation
CREATE OR REPLACE FUNCTION klonk.can_edit_custom_module(org uuid, author uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT klonk.is_org_staff(org) AND (author = klonk.current_user_id() OR klonk.current_member_role() = 'admin') $$;
--> statement-breakpoint
-- Gelöschte Module verschwinden aus den Freigaben aller Gruppen (auch fremder – daher SECURITY DEFINER)
CREATE OR REPLACE FUNCTION klonk.forget_custom_module() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$ BEGIN
    DELETE FROM group_learn_modules WHERE module_id = OLD.id;
    RETURN OLD;
  END $$;
--> statement-breakpoint
CREATE TRIGGER custom_learn_modules_forget AFTER DELETE ON custom_learn_modules
  FOR EACH ROW EXECUTE FUNCTION klonk.forget_custom_module();
--> statement-breakpoint
-- Die ID vergibt immer die Datenbank (Drizzle schreibt alle Spalten, Spaltenrechte für INSERT gehen daher nicht)
CREATE OR REPLACE FUNCTION klonk.custom_module_id() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
    NEW.id := 'custom-' || gen_random_uuid()::text;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER custom_learn_modules_id BEFORE INSERT ON custom_learn_modules
  FOR EACH ROW EXECUTE FUNCTION klonk.custom_module_id();
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA klonk FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA klonk TO klonk_user;
--> statement-breakpoint
-- Organisation und Autor:in lassen sich nachträglich nicht ändern
GRANT SELECT, INSERT, DELETE ON custom_learn_modules TO klonk_user;
--> statement-breakpoint
GRANT UPDATE (data, updated_by, updated_at) ON custom_learn_modules TO klonk_user;
--> statement-breakpoint
ALTER TABLE custom_learn_modules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY custom_learn_modules_select ON custom_learn_modules FOR SELECT TO klonk_user
  USING (klonk.is_org_staff(organization_id) OR klonk.learn_module_released(id));
--> statement-breakpoint
CREATE POLICY custom_learn_modules_insert ON custom_learn_modules FOR INSERT TO klonk_user
  WITH CHECK (klonk.is_org_staff(organization_id) AND created_by = klonk.current_user_id());
--> statement-breakpoint
CREATE POLICY custom_learn_modules_update ON custom_learn_modules FOR UPDATE TO klonk_user
  USING (klonk.can_edit_custom_module(organization_id, created_by))
  WITH CHECK (klonk.can_edit_custom_module(organization_id, created_by));
--> statement-breakpoint
CREATE POLICY custom_learn_modules_delete ON custom_learn_modules FOR DELETE TO klonk_user
  USING (klonk.can_edit_custom_module(organization_id, created_by));
--> statement-breakpoint
-- Freigeben: eigene Module nur für Gruppen ihrer Organisation
ALTER POLICY group_learn_modules_write ON group_learn_modules
  USING (klonk.can_manage_group(group_id))
  WITH CHECK (klonk.can_manage_group(group_id)
    AND (module_id NOT LIKE 'custom-%' OR klonk.custom_module_org(module_id) = klonk.group_org(group_id)));
