CREATE TABLE groups (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_id FK は auth.users を参照するが、auth スキーマがない環境 (testcontainers/local) では
-- FK 制約を追加しない。Supabase 環境のみ DO ブロックで追加する。
CREATE TABLE group_members (
    group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL,
    role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE invitations (
    token      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_by UUID        NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    use_count  INT         NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase 環境のみ auth.users への FK を追加
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'auth') THEN
    ALTER TABLE group_members
      ADD CONSTRAINT group_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    ALTER TABLE invitations
      ADD CONSTRAINT invitations_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;
