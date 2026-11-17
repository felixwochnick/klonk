-- MCP-Zugang: Stufe je Konto (`users.mcp_access`) ändern nur Admins der Organisation bzw. Betreiber:innen (auch die eigene);
-- persönliche Tokens legt jedes Konto für sich selbst an, höchstens mit seiner Stufe. OAuth-Programme und -Codes nur der Server.
CREATE OR REPLACE FUNCTION klonk.stored_mcp_access(uid uuid) RETURNS mcp_access
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT mcp_access FROM users WHERE id = uid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.guard_mcp_access() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$ BEGIN
    IF current_user = 'klonk_user' AND NOT (
      klonk.is_platform_admin()
      OR (OLD.organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'admin')
    ) THEN
      RAISE EXCEPTION 'mcp_access_forbidden' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER users_guard_mcp_access BEFORE UPDATE OF mcp_access ON users
  FOR EACH ROW WHEN (NEW.mcp_access IS DISTINCT FROM OLD.mcp_access) EXECUTE FUNCTION klonk.guard_mcp_access();
--> statement-breakpoint
-- Zugang entzogen ⇒ alle Tokens und verbundenen Programme des Kontos sofort trennen (auch ohne Rechte daran)
CREATE OR REPLACE FUNCTION klonk.revoke_mcp_tokens() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$ BEGIN
    DELETE FROM mcp_tokens WHERE user_id = NEW.id;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER users_revoke_mcp_tokens AFTER UPDATE OF mcp_access ON users
  FOR EACH ROW WHEN (NEW.mcp_access = 'none' AND OLD.mcp_access <> 'none') EXECUTE FUNCTION klonk.revoke_mcp_tokens();
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA klonk FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA klonk TO klonk_user;
--> statement-breakpoint
GRANT UPDATE (mcp_access) ON users TO klonk_user;
--> statement-breakpoint
-- Tokens: jedes Konto sieht und widerruft seine eigenen; anlegen nur persönliche Tokens bis zur eigenen Stufe.
-- Prüfen, Erneuern und „zuletzt genutzt“ laufen ohne RLS über den Server.
GRANT SELECT, INSERT, DELETE ON mcp_tokens TO klonk_user;
--> statement-breakpoint
ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mcp_tokens_select ON mcp_tokens FOR SELECT TO klonk_user
  USING (user_id = klonk.current_user_id());
--> statement-breakpoint
CREATE POLICY mcp_tokens_insert ON mcp_tokens FOR INSERT TO klonk_user
  WITH CHECK (
    user_id = klonk.current_user_id()
    AND kind = 'personal'
    AND client_id IS NULL
    AND access <= klonk.stored_mcp_access(user_id)
  );
--> statement-breakpoint
CREATE POLICY mcp_tokens_delete ON mcp_tokens FOR DELETE TO klonk_user
  USING (user_id = klonk.current_user_id());
