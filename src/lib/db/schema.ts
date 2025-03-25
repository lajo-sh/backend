import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  varchar,
  text,
  timestamp,
  real,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: varchar().unique().notNull(),
  password: varchar().notNull(),
  fullName: varchar(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  blockedPhishingEvents: many(blockedPhishingEvents),
  trustedUsers: many(trustedUsers, {
    relationName: "userToTrustedUsers",
  }),
}));

export const domains = pgTable("domains", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  domain: varchar().unique().notNull(),
  isPhishing: boolean().notNull(),
  explanation: text().notNull(),
  confidence: real().notNull(),
});

export const blockedPhishingEvents = pgTable("blocked_phishing_events", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  url: varchar().notNull(),
  domain: varchar().notNull(),
  timestamp: timestamp().defaultNow().notNull(),
});

export const blockedPhishingEventsRelations = relations(
  blockedPhishingEvents,
  ({ one }) => ({
    user: one(users, {
      fields: [blockedPhishingEvents.userId],
      references: [users.id],
    }),
  }),
);

export const sessions = pgTable("sessions", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().notNull(),
  session: varchar().unique().notNull(),
});

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const deviceTokens = pgTable("device_tokens", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().notNull(),
  token: varchar().notNull(),
  createdAt: varchar().notNull(),
});

export const deviceTokensRelations = relations(deviceTokens, ({ one }) => ({
  user: one(users, {
    fields: [deviceTokens.userId],
    references: [users.id],
  }),
}));

export const trustedUsers = pgTable("trusted_users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  trustedUserId: integer("trusted_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: varchar("created_at").notNull(),
});

export const trustedUsersRelations = relations(trustedUsers, ({ one }) => ({
  user: one(users, {
    fields: [trustedUsers.userId],
    references: [users.id],
    relationName: "userToTrustedUsers",
  }),
  trustedUser: one(users, {
    fields: [trustedUsers.trustedUserId],
    references: [users.id],
    relationName: "userToTrustedBy",
  }),
}));
