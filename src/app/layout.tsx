import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GOLIAT Monitoring Dashboard',
  description: 'Web-based monitoring dashboard for orchestrating and monitoring GOLIAT simulation studies across multiple TensorDock Windows VMs',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          <header className="bg-white shadow-sm">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex h-16 items-center justify-between">
                <div className="flex items-center">
                  <h1 className="text-xl font-semibold text-gray-900">
                    GOLIAT Monitoring Dashboard
                  </h1>
                </div>
                <nav className="flex space-x-8">
                  <a href="/" className="text-gray-600 hover:text-gray-900">Dashboard</a>
                  <a href="/workers" className="text-gray-600 hover:text-gray-900">Workers</a>
                  <a href="/super-studies" className="text-gray-600 hover:text-gray-900">Super Studies</a>
                </nav>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}