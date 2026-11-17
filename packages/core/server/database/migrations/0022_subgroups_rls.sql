-- Untergruppen (Teams) einer Klasse: die Leitung der Klasse verwaltet sie, Mitglieder kommen nur aus der Klasse.
CREATE OR REPLACE FUNCTION klonk.group_parent(gid uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT parent_id FROM groups WHERE id = gid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.is_group_member(gid uuid, uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = gid AND user_id = uid) $$;
--> statement-breakpoint
-- Gruppenleitung (bei Untergruppen auch die Leitung der Klasse), Admin der Organisation oder Plattform-Admin
CREATE OR REPLACE FUNCTION klonk.can_manage_group(gid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT klonk.is_platform_admin()
    OR klonk.group_role(gid) = 'leader'
    OR klonk.group_role(klonk.group_parent(gid)) = 'leader'
    OR (klonk.group_org(gid) = klonk.current_org_id() AND klonk.current_member_role() = 'admin') $$;
--> statement-breakpoint
-- Gruppenleitung (bei Untergruppen auch die Leitung der Klasse) oder Admin der Organisation (ohne Betreiber:innen)
CREATE OR REPLACE FUNCTION klonk.leads_group(gid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT klonk.group_role(gid) = 'leader'
    OR klonk.group_role(klonk.group_parent(gid)) = 'leader'
    OR (klonk.group_org(gid) = klonk.current_org_id() AND klonk.current_member_role() = 'admin') $$;
--> statement-breakpoint
-- Wer aus der Klasse entfernt wird, verlässt auch ihre Untergruppen (auch ohne Rechte daran – daher SECURITY DEFINER)
CREATE OR REPLACE FUNCTION klonk.leave_subgroups() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$ BEGIN
    DELETE FROM group_members WHERE user_id = OLD.user_id AND group_id IN (SELECT id FROM groups WHERE parent_id = OLD.group_id);
    RETURN OLD;
  END $$;
--> statement-breakpoint
CREATE TRIGGER group_members_leave_subgroups AFTER DELETE ON group_members
  FOR EACH ROW EXECUTE FUNCTION klonk.leave_subgroups();
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA klonk FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA klonk TO klonk_user;
--> statement-breakpoint
-- Anlegen: Lehrkräfte/Admins; Untergruppen nur in einer Klasse (oberste Ebene), die man verwaltet
DROP POLICY groups_insert ON groups;
--> statement-breakpoint
CREATE POLICY groups_insert ON groups FOR INSERT TO klonk_user
  WITH CHECK (
    (klonk.is_org_staff(organization_id) OR klonk.is_platform_admin())
    AND (parent_id IS NULL OR (
      klonk.can_manage_group(parent_id)
      AND organization_id = klonk.group_org(parent_id)
      AND klonk.group_parent(parent_id) IS NULL
    ))
  );
--> statement-breakpoint
-- Ändern: Organisation und Klasse bleiben (gespeicherte Werte)
DROP POLICY groups_update ON groups;
--> statement-breakpoint
CREATE POLICY groups_update ON groups FOR UPDATE TO klonk_user
  USING (klonk.can_manage_group(id))
  WITH CHECK (klonk.can_manage_group(id) AND organization_id = klonk.group_org(id) AND parent_id IS NOT DISTINCT FROM klonk.group_parent(id));
--> statement-breakpoint
-- Mitglieder einer Untergruppe müssen Mitglieder der Klasse sein
DROP POLICY group_members_insert ON group_members;
--> statement-breakpoint
CREATE POLICY group_members_insert ON group_members FOR INSERT TO klonk_user
  WITH CHECK (
    klonk.stored_org_id(user_id) = klonk.group_org(group_id)
    AND (klonk.group_parent(group_id) IS NULL OR klonk.is_group_member(klonk.group_parent(group_id), user_id))
    AND (klonk.can_manage_group(group_id)
      OR (user_id = klonk.current_user_id() AND role = 'leader' AND klonk.is_org_staff(klonk.group_org(group_id)) AND NOT klonk.group_has_members(group_id)))
  );
