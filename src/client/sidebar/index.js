import React from 'react';
import { createRoot } from 'react-dom/client';
import SidebarContainer from './components/Sidebar';
import '../base.css';

const container = document.getElementById('index');
const root = createRoot(container);
root.render(<SidebarContainer />);
