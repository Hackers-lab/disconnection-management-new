import { promises as fs } from "fs"
import path from "path"
import crypto from "crypto"

const FILE_PATH = path.join(process.cwd(), "data", "user-credentials.json")

export interface UserCredentials {
  id: string
  username: string
  passwordHash: string
  role: "admin" | "user"
  agencies: string[]
}

class UserCredentialsStorage {
  private cache: UserCredentials[] | null = null
  private async load(): Promise<UserCredentials[]> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(FILE_PATH, "utf8")
      this.cache = JSON.parse(raw) as UserCredentials[]
    } catch {
      // File missing → start with an empty array
      this.cache = []
      await this.persist()
    }
    return this.cache
  }

  private async persist() {
    if (!this.cache) return
    await fs.mkdir(path.dirname(FILE_PATH), { recursive: true })
    await fs.writeFile(FILE_PATH, JSON.stringify(this.cache, null, 2), "utf8")
  }

  async findUserByCredentials(username: string, password: string) {
    const users = await this.load()
    const user = users.find((u) => u.username === username)
    if (!user) return null
    const hash = crypto.createHash("sha256").update(password).digest("hex")
    return hash === user.passwordHash ? user : null
  }

  async addUser(username: string, password: string, role: "admin" | "user", agencies: string[] = []) {
    const users = await this.load()
    if (users.some((u) => u.username === username)) {
      throw new Error("Username already exists")
    }
    const newUser: UserCredentials = {
      id: crypto.randomUUID(),
      username,
      passwordHash: crypto.createHash("sha256").update(password).digest("hex"),
      role,
      agencies,
    }
    users.push(newUser)
    await this.persist()
    return newUser
  }

  /** Used by admin/debug APIs */
  async all() {
    return this.load()
  }
}

export const userCredentialsStorage = new UserCredentialsStorage()
