import React, { useEffect, useState } from 'react';
import { resolveReadableUrl } from '../services/supabaseStorageService';

export default function StorageImage({ src, alt = '', ...rest }) {
  const source = src || '';
  const isStoredObject = String(source).includes('/storage/v1/object/');
  const [resolvedFor, setResolvedFor] = useState(source);
  const [url, setUrl] = useState(isStoredObject ? '' : source);

  if (source !== resolvedFor) {
    setResolvedFor(source);
    setUrl(String(source).includes('/storage/v1/object/') ? '' : source);
  }

  useEffect(() => {
    let cancel = false;
    if (!source || !String(source).includes('/storage/v1/object/')) return undefined;
    resolveReadableUrl(source).then((next) => {
      if (!cancel) setUrl(next || '');
    });
    return () => {
      cancel = true;
    };
  }, [source]);

  if (!url) return null;
  return <img key={source} src={url} alt={alt} {...rest} />;
}
