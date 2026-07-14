// statuses are fixed in code (backend cortex/statuses.py); a task/project status is its string key
export type Status = string

export interface StatusDef {
  id: number
  space_id: number
  kind: 'task' | 'project'
  key: string
  label: string
  color: string
  sort_order: number
  is_done: boolean
}
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface User {
  id: number
  username: string
  is_admin: boolean
  is_active: boolean
  created_at: string
}

export interface Space {
  id: number
  name: string
  created_at: string
  default_sprint_days: number
}

export interface Sprint {
  id: number
  space_id: number
  name: string
  start_date: string
  end_date: string
  created_at: string
  is_current: boolean
  archived: boolean
}

export interface Task {
  id: number
  ref: string | null
  space_id: number
  title: string
  description: string
  status: Status
  priority: Priority
  assignee_id: number | null
  sprint_id: number | null
  project_id: number | null
  sort_order: number
  created_by: number | null
  created_at: string
  updated_at: string
  blocked: boolean
}

export interface ReactionAgg {
  emoji: string
  count: number
  user_ids: number[]
}

export interface Comment {
  id: number
  parent_type: 'task' | 'project'
  parent_id: number
  author_id: number
  author_username: string
  body: string
  created_at: string
  reactions: ReactionAgg[]
}

export interface Activity {
  id: number
  task_id: number
  actor_id: number
  actor_username: string
  type: string
  detail: Record<string, unknown>
  created_at: string
}

export interface TaskDetail extends Task {
  comments: Comment[]
  activity: Activity[]
  blockers: Task[]
  blocking: Task[]
}

export interface Milestone {
  title: string
  date: string
}

export interface Project {
  id: number
  space_id: number
  title: string
  description: string
  due_date: string | null
  start_date: string | null
  owner_id: number | null
  status: string
  priority: Priority
  tags: string[]
  milestones: Milestone[]
  archived: boolean
  created_at: string
  open_tasks: number
  total_tasks: number
}

export interface ProjectDetail extends Project {
  comments: Comment[]
  tasks: Task[]
}

export interface Notification {
  id: number
  user_id: number
  type: 'assigned' | 'status_changed' | 'commented' | 'mentioned'
  actor_id: number
  actor_username: string
  task_id: number | null
  task_title: string | null
  project_id: number | null
  project_title: string | null
  comment_id: number | null
  created_at: string
  read_at: string | null
}

export interface NotificationBox {
  items: Notification[]
  unread: number
}

export interface SearchTaskHit {
  id: number
  title: string
  status: Status
  priority: Priority
  sprint_id: number | null
  space_id: number
  snippet: string
}

export interface SearchProjectHit {
  id: number
  title: string
  due_date: string | null
  space_id: number
  snippet: string
}

export interface SearchCommentHit {
  id: number
  parent_type: 'task' | 'project'
  parent_id: number
  author_username: string
  parent_title: string
  space_id: number
  snippet: string
}

export interface SearchResults {
  tasks: SearchTaskHit[]
  projects: SearchProjectHit[]
  comments: SearchCommentHit[]
}

export interface ApiKey {
  id: number
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
  key?: string
}
