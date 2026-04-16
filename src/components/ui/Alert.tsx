/**
 * Alert Components
 * Componenti per messaggi di avviso
 */

import { HTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
}

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={clsx(
        'relative w-full rounded-lg border p-4',
        {
          'border-gray-200 bg-white text-gray-950': variant === 'default',
          'border-red-200 bg-red-50 text-red-900': variant === 'destructive',
        },
        className
      )}
      {...props}
    />
  )
);
Alert.displayName = 'Alert';

const AlertDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx('text-sm [&_p]:leading-relaxed', className)}
      {...props}
    />
  )
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription };