export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  
  if (isNaN(date.getTime())) {
    return '';
  }
  
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 0) {
    return 'ahora';
  }
  
  if (diffInSeconds < 60) {
    return 'ahora';
  }
  
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `hace ${mins} min`;
  }
  
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `hace ${hours}h`;
  }
  
  if (diffInSeconds < 172800) {
    return 'ayer';
  }
  
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `hace ${days} días`;
  }
  
  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short'
  });
}
