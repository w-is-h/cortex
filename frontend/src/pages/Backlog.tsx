import { useState } from 'react'
import { useTasks } from '../api/hooks'
import { FilterMenu, useVisibleTasks } from '../components/filters'
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
  const items = useVisibleTasks(tasks.data ?? [])

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h1 className="font-heading font-normal italic text-[1.7rem]">Backlog</h1>
        <span className="font-mono text-[11px] text-ink-faint mt-0.5">{items.length}</span>
        <div className="flex-1" />
        <FilterMenu users />
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
        <Button
          disabled={items.length < 2}
          onClick={() => selection.setMany(items.map((t) => t.id))}
        >
          Select all
        </Button>
        <Button kind="primary" onClick={() => setNewTask(true)}>+ Task</Button>
      </div>
      <div>
        <TaskTable
          tasks={items}
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
