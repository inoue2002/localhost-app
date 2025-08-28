import React from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import Top from './pages/Top';
import Master from './pages/Master';
import User from './pages/User';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Top />} />
      <Route path="/master" element={<Master />} />
      <Route path="/user" element={<User />} />
      <Route path="*" element={<Top />} />
    </Routes>
  );
}

