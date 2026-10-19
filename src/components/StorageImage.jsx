import React, { useEffect, useState } from 'react';
import { resolveReadableUrl } from '../services/supabaseStorageService';

export default function StorageImage({ src, alt = '', ...rest }) {
  const [url, setUrl] = useState(src && !String(src).includes('/storage/v1/object/') ? src : '');

  useEffect(() => {
    let cancel = false;
    if (!src) {
      setUrl('');
      return undefined;
    }
    resolveReadableUrl(src).then((next) => {
      if (!cancel) setUrl(next || '');
    });
    return () => {
      cancel = true;
    };
  }, [src]);

  if (!url) return null;
  return <img src={url} alt={alt} {...rest} />;
}
