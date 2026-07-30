import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { TooltipProvider } from '@/components/ui/tooltip'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { EditorPage } from '@/pages/EditorPage'

function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/project/:projectId" element={<EditorPage />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
