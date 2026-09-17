import AdminCategoryOrder from '../../components/AdminCategoryOrder';

export default function AdminLayout({ children }) {
  return <>
    <AdminCategoryOrder />
    {children}
  </>;
}
