import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Store } from '@/pages/Store';
import { Product } from '@/pages/Product';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { CustomerChat } from '@/pages/CustomerChat';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Store />} />
        <Route path="/category/:category" element={<Store />} />
        <Route path="/product/:sku" element={<Product />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/support" element={<CustomerChat />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
