import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

export interface Workspace {
  id: string;
  slug: string;
  title: string;
  code: string;
  languageMode: "cpp17" | "cpp20";
  visibility: "private" | "unlisted" | "public";
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface WorkspaceRepository {
  create(
    input: Pick<Workspace, "title" | "code" | "languageMode" | "visibility">,
  ): Promise<Workspace>;
  getBySlug(slug: string): Promise<Workspace | undefined>;
  getById(id: string): Promise<Workspace | undefined>;
  update(
    id: string,
    version: number,
    patch: Partial<Pick<Workspace, "title" | "code" | "languageMode" | "visibility">>,
  ): Promise<Workspace | undefined>;
  fork(id: string): Promise<Workspace | undefined>;
}
const slug = () => randomBytes(8).toString("base64url");

export class MemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly values = new Map<string, Workspace>();
  async create(input: Pick<Workspace, "title" | "code" | "languageMode" | "visibility">) {
    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: randomUUID(),
      slug: slug(),
      ...input,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.values.set(workspace.id, workspace);
    return workspace;
  }
  async getBySlug(value: string) {
    return [...this.values.values()].find((workspace) => workspace.slug === value);
  }
  async getById(id: string) {
    return this.values.get(id);
  }
  async update(
    id: string,
    version: number,
    patch: Partial<Pick<Workspace, "title" | "code" | "languageMode" | "visibility">>,
  ) {
    const current = this.values.get(id);
    if (!current || current.version !== version) return undefined;
    const updated: Workspace = {
      ...current,
      ...patch,
      version: version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.values.set(id, updated);
    return updated;
  }
  async fork(id: string) {
    const original = this.values.get(id);
    if (!original) return undefined;
    return this.create({
      title: `${original.title} (fork)`,
      code: original.code,
      languageMode: original.languageMode,
      visibility: "unlisted",
    });
  }
}

export class PgWorkspaceRepository implements WorkspaceRepository {
  private readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }
  private map(row: Record<string, any>): Workspace {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      code: row.code,
      languageMode: row.language_mode,
      visibility: row.visibility,
      version: row.version,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
  async create(input: Pick<Workspace, "title" | "code" | "languageMode" | "visibility">) {
    const result = await this.pool.query(
      "INSERT INTO workspaces (id,slug,title,code,language_mode,visibility) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [randomUUID(), slug(), input.title, input.code, input.languageMode, input.visibility],
    );
    return this.map(result.rows[0]);
  }
  async getBySlug(value: string) {
    const result = await this.pool.query("SELECT * FROM workspaces WHERE slug=$1", [value]);
    return result.rows[0] ? this.map(result.rows[0]) : undefined;
  }
  async getById(id: string) {
    const result = await this.pool.query("SELECT * FROM workspaces WHERE id=$1", [id]);
    return result.rows[0] ? this.map(result.rows[0]) : undefined;
  }
  async update(
    id: string,
    version: number,
    patch: Partial<Pick<Workspace, "title" | "code" | "languageMode" | "visibility">>,
  ) {
    const current = await this.getById(id);
    if (!current || current.version !== version) return undefined;
    const next = { ...current, ...patch };
    const result = await this.pool.query(
      "UPDATE workspaces SET title=$1,code=$2,language_mode=$3,visibility=$4,version=version+1,updated_at=now() WHERE id=$5 AND version=$6 RETURNING *",
      [next.title, next.code, next.languageMode, next.visibility, id, version],
    );
    return result.rows[0] ? this.map(result.rows[0]) : undefined;
  }
  async fork(id: string) {
    const original = await this.getById(id);
    return original
      ? this.create({
          title: `${original.title} (fork)`,
          code: original.code,
          languageMode: original.languageMode,
          visibility: "unlisted",
        })
      : undefined;
  }
}
