import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { Shell, SpaceRedirect } from './components/Shell'
import { Admin } from './pages/Admin'
import { Account } from './pages/Account'
import { Backlog } from './pages/Backlog'
import { Board } from './pages/Board'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { ProjectPage } from './pages/Project'
import { Projects } from './pages/Projects'
import { Sprints } from './pages/Sprints'
import { TaskPage } from './pages/Task'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1 },
  },
})

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 's/:spaceId/board', element: <Board /> },
      { path: 's/:spaceId/backlog', element: <Backlog /> },
      { path: 's/:spaceId/sprints', element: <Sprints /> },
      { path: 's/:spaceId/projects', element: <Projects /> },
      // legacy space-less paths redirect into the active space
      { path: 'board', element: <SpaceRedirect to="board" /> },
      { path: 'backlog', element: <SpaceRedirect to="backlog" /> },
      { path: 'sprints', element: <SpaceRedirect to="sprints" /> },
      { path: 'projects', element: <SpaceRedirect to="projects" /> },
      { path: 'projects/:id', element: <ProjectPage /> },
      { path: 'tasks/:id', element: <TaskPage /> },
      { path: 'admin', element: <Admin /> },
      { path: 'account', element: <Account /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
