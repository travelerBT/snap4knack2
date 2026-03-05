import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

type ModalType = 'success' | 'error' | 'warning' | 'info';

interface ModalProps {
  open: boolean;
  type?: ModalType;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  loading?: boolean;
}

const iconMap = {
  success: { Icon: CheckCircleIcon, color: 'text-green-600', bg: 'bg-green-100' },
  error: { Icon: ExclamationCircleIcon, color: 'text-red-600', bg: 'bg-red-100' },
  warning: { Icon: ExclamationTriangleIcon, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  info: { Icon: InformationCircleIcon, color: 'text-blue-600', bg: 'bg-blue-100' },
};

const confirmButtonClass = {
  success: 'bg-green-600 hover:bg-green-700',
  error: 'bg-red-600 hover:bg-red-700',
  warning: 'bg-yellow-600 hover:bg-yellow-700',
  info: 'bg-blue-600 hover:bg-blue-700',
};

export default function Modal({
  open,
  type = 'info',
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  loading = false,
}: ModalProps) {
  const { Icon, color, bg } = iconMap[type];

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 rounded-full p-2 ${bg}`}>
                    <Icon className={`h-6 w-6 ${color}`} />
                  </div>
                  <div className="flex-1">
                    <Dialog.Title className="text-base font-semibold text-gray-900">
                      {title}
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-600">{message}</p>
                  </div>
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  {onConfirm && (
                    <button
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      {cancelLabel}
                    </button>
                  )}
                  <button
                    onClick={onConfirm || onClose}
                    disabled={loading}
                    className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${confirmButtonClass[type]}`}
                  >
                    {loading ? 'Loading…' : confirmLabel}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
