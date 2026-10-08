import type { RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout.tsx'
import { CategoriesPage } from './pages/CategoriesPage.tsx'
import { DashboardPage } from './pages/DashboardPage.tsx'
import { InvestmentsPage } from './pages/InvestmentsPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { SimulatorPage } from './pages/SimulatorPage.tsx'
import { TransactionsPage } from './pages/TransactionsPage.tsx'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    // The auth guard is added here in milestone 2.
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'investments', element: <InvestmentsPage /> },
      { path: 'simulator', element: <SimulatorPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]
