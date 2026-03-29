import {
  pgTable,
  varchar,
  text,
  boolean,
  integer,
  serial,
  timestamp,
  date,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const projects = pgTable("projects", {
  id: varchar("id", { length: 20 }).primaryKey(),
  name: text("name").notNull(),
  isInbox: boolean("is_inbox").notNull().default(false),
  color: varchar("color", { length: 50 }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  todoistCreatedAt: timestamp("todoist_created_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sections = pgTable("sections", {
  id: varchar("id", { length: 20 }).primaryKey(),
  projectId: varchar("project_id", { length: 20 })
    .notNull()
    .references(() => projects.id),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: varchar("id", { length: 20 }).primaryKey(),
    content: text("content").notNull(),
    description: text("description"),
    projectId: varchar("project_id", { length: 20 }).references(
      () => projects.id
    ),
    sectionId: varchar("section_id", { length: 20 }).references(
      () => sections.id
    ),
    parentId: varchar("parent_id", { length: 20 }),
    priority: integer("priority").notNull().default(1),
    labels: text("labels").array().notNull().default([]),
    dueDate: date("due_date"),
    dueIsRecurring: boolean("due_is_recurring").notNull().default(false),
    dueString: text("due_string"),
    dueTimezone: text("due_timezone"),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    todoistCreatedAt: timestamp("todoist_created_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tasks_project_id_idx").on(table.projectId),
    index("tasks_completed_idx").on(table.isCompleted, table.completedAt),
    index("tasks_due_date_idx").on(table.dueDate),
    index("tasks_section_id_idx").on(table.sectionId),
  ]
);

export const taskCompletions = pgTable(
  "task_completions",
  {
    id: serial("id").primaryKey(),
    taskId: varchar("task_id", { length: 20 })
      .notNull()
      .references(() => tasks.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedDate: date("completed_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("task_completions_task_date_unique").on(table.taskId, table.completedDate)]
);

export const webhookEvents = pgTable("webhook_events", {
  deliveryId: varchar("delivery_id", { length: 100 }).primaryKey(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  tasksSynced: integer("tasks_synced"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
});

// Relations
export const projectsRelations = relations(projects, ({ many }) => ({
  sections: many(sections),
  tasks: many(tasks),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  project: one(projects, {
    fields: [sections.projectId],
    references: [projects.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  section: one(sections, {
    fields: [tasks.sectionId],
    references: [sections.id],
  }),
  completions: many(taskCompletions),
}));

export const taskCompletionsRelations = relations(taskCompletions, ({ one }) => ({
  task: one(tasks, {
    fields: [taskCompletions.taskId],
    references: [tasks.id],
  }),
}));
