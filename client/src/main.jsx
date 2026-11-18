import React, { useEffect, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation, Link, Navigate } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { Provider, useApp } from './lib.jsx';
import { Header, Footer, AuthModal, SearchModal } from './components/Shell.jsx';
import { Loading, Empty } from './components/UI.jsx';
import Home from './pages/Home.jsx';
import { Browse, Article, About } from './pages/Reading.jsx';
import { Subscribe, Account } from './pages/Membership.jsx';
import './styles/base.css';
import './styles/home.css';
import './styles/pages.css';
import './styles/cms.css';
import './styles/responsive.css';
const Newsroom = lazy(() => import('./pages/Newsroom.jsx'));
function StaffEntry() {
  const { search } = useLocation();
  return <Navigate to={'/newsroom' + (search || '?tab=roles')} replace />;
}
function App() {
  const { pathname } = useLocation(),
    { auth, search, toast } = useApp();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  const cms = pathname.startsWith('/newsroom') || pathname === '/admin' || pathname === '/cms';
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {!cms && <Header />}
      <div className="route-content" key={pathname}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/section/:slug" element={<Browse />} />
            <Route path="/latest" element={<Browse />} />
            <Route path="/story/:slug" element={<Article />} />
            <Route path="/subscribe" element={<Subscribe />} />
            <Route path="/account" element={<Account />} />
            <Route path="/about/:page" element={<About />} />
            <Route path="/admin" element={<StaffEntry />} />
            <Route path="/cms" element={<StaffEntry />} />
            <Route path="/newsroom/*" element={<Newsroom />} />
            <Route
              path="*"
              element={
                <main className="inner-page container page-pad">
                  <Empty
                    title="This page isn’t in the edition"
                    text="The address may have changed. Return to the front page to keep reading."
                  >
                    <Link className="btn dark" to="/">
                      Front page
                      <ArrowRight size={15} />
                    </Link>
                  </Empty>
                </main>
              }
            />
          </Routes>
        </Suspense>
      </div>
      {!cms && <Footer />}
      {auth && <AuthModal />}
      {search && <SearchModal />}
      {toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Provider>
      <App />
    </Provider>
  </BrowserRouter>,
);
