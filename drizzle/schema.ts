import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const conversations = mysqlTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const voiceProfiles = mysqlTable("voice_profiles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  elevenVoiceId: varchar("elevenVoiceId", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  sourceAssetKey: varchar("sourceAssetKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const voiceAssets = mysqlTable("voice_assets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: varchar("conversationId", { length: 36 }).references(() => conversations.id, { onDelete: "set null" }),
  kind: mysqlEnum("kind", ["source", "generated"]).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  byteLength: int("byteLength").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const messages = mysqlTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: varchar("conversationId", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  kind: mysqlEnum("kind", ["text", "audio", "transcript", "event"]).notNull(),
  content: text("content").notNull(),
  assetId: varchar("assetId", { length: 36 }).references(() => voiceAssets.id, { onDelete: "set null" }),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const userPreferences = mysqlTable("user_preferences", {
  userId: int("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  language: mysqlEnum("language", ["ar", "en"]).default("ar").notNull(),
  theme: mysqlEnum("theme", ["dark", "light"]).default("dark").notNull(),
  saveToCloud: boolean("saveToCloud").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type VoiceProfile = typeof voiceProfiles.$inferSelect;
export type VoiceAsset = typeof voiceAssets.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type UserPreference = typeof userPreferences.$inferSelect;
