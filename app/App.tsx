import { useRoutes } from 'react-router-dom';
import { routes } from './routes';
import { DefaultLayout } from './components/layouts';
import './App.css';


export function App() {
  const element = useRoutes(routes);
  return <DefaultLayout>{element}</DefaultLayout>;
}
