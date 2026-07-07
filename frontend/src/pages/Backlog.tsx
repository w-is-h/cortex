import { useState } from 'react'
import { useTasks } from '../api/hooks'
import { useSpace } from '../components/Shell'
import { MoveBar, NewTaskModal, TaskTable, useSelection } from '../components/TaskBits'
import { Button, SegmentedToggle } from '../components/ui'

type GroupBy = 'none' | 'status' | 'project' | 'user' | 'tag'

export function Backlog() {
  const { space } = useSpace()
  const tasks = useTasks({ space_id: space.id, backlog: true })
  const selection = useSelection()
  const [newTask, setNewTask] = useState(false)
  const [group, setGroup] = useState<GroupBy>(
    () => (localStorage.getItem('cortex.backlog.group') as GroupBy) || 'none',
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-xl font-bold">Backlog</h1>
        <span className="font-mono text-[11px] text-ink-faint mt-0.5">{tasks.data?.length ?? 0}</span>
        <div className="flex-1" />
        <SegmentedToggle
          value={group}
          onChange={(v) => { setGroup(v); localStorage.setItem('cortex.backlog.group', v) }}
          options={[
            { value: 'none', label: 'None' },
            { value: 'status', label: 'Status' },
            { value: 'project', label: 'Project' },
            { value: 'user', label: 'User' },
            { value: 'tag', label: 'Tag' },
          ]}
        />
        {(tasks.data?.length ?? 0) > 1 && (
          <Button onClick={() => selection.setMany(tasks.data!.map((t) => t.id))}>Select all</Button>
        )}
        <Button kind="primary" onClick={() => setNewTask(true)}>+ Task</Button>
      </div>
      <div className="max-w-5xl mx-auto">
        <TaskTable
          tasks={tasks.data ?? []}
          selection={selection}
          showProject={group !== 'project'}
          groupBy={group === 'none' ? undefined : group}
        />
      </div>
      <MoveBar selection={selection} />
      <NewTaskModal open={newTask} onClose={() => setNewTask(false)} sprintId={null} />
    </div>
  )
}
