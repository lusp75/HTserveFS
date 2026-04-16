/**
 * Security Maintenance Page
 * Pagina di manutenzione per la sezione Sicurezza temporaneamente disabilitata
 */

import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SecurityMaintenance() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500" />
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              Sezione in Manutenzione
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              La sezione Sicurezza è temporaneamente non disponibile per manutenzione tecnica.
            </p>
          </div>

          <div className="mt-8">
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Funzionalità temporaneamente disabilitate:
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Visualizzazione IP bloccati</li>
                      <li>Sblocco IP singoli</li>
                      <li>Sblocco massivo IP</li>
                      <li>Monitoraggio throttling</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm text-gray-500 text-center">
                Per assistenza urgente, contattare l'amministratore di sistema.
              </p>
            </div>

            <div className="mt-6">
              <Link
                to="/"
                className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Torna alla Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}