import { mount } from 'svelte';
import App from './components/App.svelte';
import './styles/global.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app element not found');

const app = mount(App, { target });

export default app;
