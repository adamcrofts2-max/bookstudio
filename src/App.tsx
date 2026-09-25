import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { EditorPage } from '@/pages/EditorPage'

function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          {/* Per-route rather than only at the root: a crash inside the
              editor leaves the router mounted, so "Reload" and browser
              navigation still work instead of the whole app disappearing. */}
          <Route
            path="/project/:projectId"
            element={
              <ErrorBoundary area="the editor">
                <EditorPage />
              </ErrorBoundary>
            }
          />
        </Routes>
      </BrowserRouter>
      </TooltipProvider>
    </ErrorBoundary>
  )
}

export default App
