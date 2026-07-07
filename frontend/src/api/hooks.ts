import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { api, qs, ApiError } from './client'
import type {
  ApiKey, Comment, NotificationBox, Project, ProjectDetail, SearchResults,
  Space, Sprint, StatusDef, Task, TaskDetail, User,
} from './types'

// ---- queries

export function useMe() {
  return useQuery<User, ApiError>({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/api/users'), staleTime: 60_000 })

export const useSpaces = () =>
  useQuery({ queryKey: ['spaces'], queryFn: () => api.get<Space[]>('/api/spaces'), staleTime: 60_000 })

export const useSprints = (spaceId: number | undefined) =>
  useQuery({
    queryKey: ['sprints', spaceId],
    queryFn: () => api.get<Sprint[]>(`/api/sprints${qs({ space_id: spaceId })}`),
    enabled: spaceId !== undefined,
  })

export const useStatuses = (spaceId: number | undefined, kind: 'task' | 'project') =>
  useQuery({
    queryKey: ['statuses', spaceId, kind],
    queryFn: () => api.get<StatusDef[]>(`/api/statuses${qs({ space_id: spaceId, kind })}`),
    enabled: spaceId !== undefined,
    staleTime: Infinity, // fixed in code — never changes at runtime
  })

export interface TaskFilters {
  space_id?: number
  sprint_id?: number
  backlog?: boolean
  status?: string
  assignee_id?: number
  project_id?: number
}

export const useTasks = (filters: TaskFilters, opts?: Partial<UseQueryOptions<Task[]>>) =>
  useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => api.get<Task[]>(`/api/tasks${qs(filters as Record<string, never>)}`),
    ...opts,
  })

export const useTask = (id: number | undefined) =>
  useQuery({
    queryKey: ['task', id],
    queryFn: () => api.get<TaskDetail>(`/api/tasks/${id}`),
    enabled: id !== undefined,
  })

export const useMyTasks = () =>
  useQuery({ queryKey: ['my-tasks'], queryFn: () => api.get<Task[]>('/api/me/tasks') })

export const useProjects = (spaceId: number | undefined, includeArchived = false) =>
  useQuery({
    queryKey: ['projects', spaceId, includeArchived],
    queryFn: () =>
      api.get<Project[]>(`/api/projects${qs({ space_id: spaceId, include_archived: includeArchived })}`),
    enabled: spaceId !== undefined,
  })

export const useProject = (id: number | undefined) =>
  useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<ProjectDetail>(`/api/projects/${id}`),
    enabled: id !== undefined,
  })

export const useNotifications = (enabled: boolean) =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationBox>('/api/notifications'),
    refetchInterval: 30_000,
    enabled,
  })

export interface SearchFilters { kind?: string; status?: string; hasImages?: boolean }

export const useSearch = (q: string, spaceId?: number, filters?: SearchFilters) =>
  useQuery({
    queryKey: ['search', q, spaceId, filters],
    queryFn: () => api.get<SearchResults>(`/api/search${qs({
      q, space_id: spaceId, kinds: filters?.kind, status: filters?.status,
      has_images: filters?.hasImages || undefined,
    })}`),
    enabled: q.trim().length > 0,
    placeholderData: (prev) => prev,
  })

export const useApiKeys = () =>
  useQuery({ queryKey: ['api-keys'], queryFn: () => api.get<ApiKey[]>('/api/me/api-keys') })

// ---- mutations

/** Invalidate every cache a task mutation can touch. */
function useInvalidateTasks() {
  const qc = useQueryClient()
  return (taskId?: number) => {
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['my-tasks'] })
    if (taskId !== undefined) qc.invalidateQueries({ queryKey: ['task', taskId] })
    qc.invalidateQueries({ queryKey: ['project'] })
  }
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (username: string) => api.post<User>('/api/auth/login', { username }),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => qc.clear(),
  })
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: (data: Partial<Task> & { space_id: number; title: string }) =>
      api.post<Task>('/api/tasks', data),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Task> & { id: number }) =>
      api.patch<Task>(`/api/tasks/${id}`, patch),
    // optimistic: patch the task into every cached task list (board drag feels instant).
    // The setQueriesData MUST run synchronously — before any await — so the re-render
    // right after the drop already shows the card in its new column. Awaiting first
    // (e.g. cancelQueries) defers the patch a microtask, and dnd renders the card back
    // in its origin column for one frame → the flash.
    onMutate: async ({ id, ...patch }) => {
      const previous = qc.getQueriesData<Task[]>({ queryKey: ['tasks'] })
      qc.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) =>
        old?.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      )
      await qc.cancelQueries({ queryKey: ['tasks'] })
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: (task) => invalidate(task?.id),
  })
}

export function useMoveTasks() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: (body: { task_ids: number[]; sprint_id: number | null }) =>
      api.post<Task[]>('/api/tasks/move', body),
    onSuccess: () => invalidate(),
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/tasks/${id}`),
    onSuccess: () => invalidate(),
  })
}

export function useBlockerMutation() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: ({ taskId, blockerId, remove }: { taskId: number; blockerId: number; remove?: boolean }) =>
      remove
        ? api.delete<Task>(`/api/tasks/${taskId}/blockers/${blockerId}`)
        : api.put<Task>(`/api/tasks/${taskId}/blockers/${blockerId}`),
    onSuccess: (_t, { taskId, blockerId }) => {
      invalidate(taskId)
      invalidate(blockerId)
    },
  })
}

export function useCreateSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { space_id: number; name: string; start_date: string; end_date: string }) =>
      api.post<Sprint>('/api/sprints', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints'] }),
  })
}

export function useUpdateSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Sprint> & { id: number }) =>
      api.patch<Sprint>(`/api/sprints/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints'] }),
  })
}

export function useDeleteSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/sprints/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sprints'] }); qc.invalidateQueries({ queryKey: ['tasks'] }) },
  })
}

export function useCreateSpace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.post<Space>('/api/spaces', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spaces'] }),
  })
}

export function useUpdateSpace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Space> & { id: number }) =>
      api.patch<Space>(`/api/spaces/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spaces'] }),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { space_id: number; title: string; due_date: string; description?: string; start_date?: string; owner_id?: number | null; status?: string }) =>
      api.post<Project>('/api/projects', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Project> & { id: number }) =>
      api.patch<Project>(`/api/projects/${id}`, patch),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', p.id] })
    },
  })
}

/** Comment create/delete + reactions; invalidates the parent's detail query. */
export function useCommentMutations(parentType: 'task' | 'project', parentId: number) {
  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: [parentType === 'task' ? 'task' : 'project', parentId] })
  const create = useMutation({
    mutationFn: (body: string) =>
      api.post<Comment>(`/api/${parentType}s/${parentId}/comments`, { body }),
    onSuccess: invalidate,
  })
  const edit = useMutation({
    mutationFn: ({ commentId, body }: { commentId: number; body: string }) =>
      api.patch<Comment>(`/api/comments/${commentId}`, { body }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (commentId: number) => api.delete(`/api/comments/${commentId}`),
    onSuccess: invalidate,
  })
  const react = useMutation({
    mutationFn: ({ commentId, emoji, remove }: { commentId: number; emoji: string; remove: boolean }) =>
      remove
        ? api.delete<Comment>(`/api/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`)
        : api.put<Comment>(`/api/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`),
    onSuccess: invalidate,
  })
  return { create, edit, remove, react }
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[] | null) => api.post('/api/notifications/read', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useUserAdmin() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] })
  const create = useMutation({
    mutationFn: (data: { username: string; is_admin?: boolean }) =>
      api.post<User>('/api/users', data),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: number; is_admin?: boolean; is_active?: boolean }) =>
      api.patch<User>(`/api/users/${id}`, patch),
    onSuccess: invalidate,
  })
  return { create, update }
}

export function useApiKeyMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['api-keys'] })
  const create = useMutation({
    mutationFn: (name: string) => api.post<ApiKey>('/api/me/api-keys', { name }),
    onSuccess: invalidate,
  })
  const revoke = useMutation({
    mutationFn: (id: number) => api.delete(`/api/me/api-keys/${id}`),
    onSuccess: invalidate,
  })
  return { create, revoke }
}

export const uploadImage = (file: File | Blob) =>
  api.upload<{ id: string; url: string }>('/api/images', file)
