import { useAuth } from '../../context/AuthContext';
import MainDashboard from './MainDashboard';
import StaffDashboard from './StaffDashboard';

export default function DashboardHome() {
  const { user } = useAuth();
  return ['kasir', 'kitchen', 'barista'].includes(user.role)
    ? <StaffDashboard key={user.role} role={user.role} />
    : <MainDashboard />;
}
