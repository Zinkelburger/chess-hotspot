'use client';

import { Dialog } from '@headlessui/react';

type Props = {
  spot: any;
  onClose: () => void;
};

export default function SpotPopup({ spot, onClose }: Props) {
  return (
    <Dialog open onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center">
      <Dialog.Panel className="w-[min(90vw,380px)] rounded-xl bg-white p-4 shadow-xl space-y-3">
        <img
          src={spot.photo ?? '/img/default.jpg'}
          alt={spot.name}
          className="w-full h-48 object-cover rounded-lg"
        />
        <h2 className="text-lg font-semibold text-black">{spot.name}</h2>

        {spot.notes && <p className="text-sm text-gray-700">{spot.notes}</p>}

        <div className="flex gap-3 text-sm">
          {spot.gmap && (
            <a href={spot.gmap} target="_blank" rel="noopener" className="text-emerald-600 underline">
              Google Maps
            </a>
          )}
          {spot.website && (
            <a href={spot.website} target="_blank" rel="noopener" className="text-emerald-600 underline">
              Club site
            </a>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-2 w-full rounded-md bg-emerald-500 py-1 text-white hover:bg-emerald-600"
        >
          Close
        </button>
      </Dialog.Panel>
    </Dialog>
  );
}
