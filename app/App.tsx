import { useRoutes } from 'react-router-dom';
import { DefaultLayout } from './components/layouts';
import { routes } from './routes';
import './App.css';

export function App() {
  const element = useRoutes(routes);
  return <DefaultLayout>{element}</DefaultLayout>;
}
