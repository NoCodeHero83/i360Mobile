import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNotifications } from '../../context/NotificationContext';
import { formatTimeAgo } from '../../utils/formatTimeAgo';

interface NotificationItemProps {
  onPress: () => void;
}

export function NotificationItem({ onPress }: NotificationItemProps) {
  const { lastNotification, unreadCount } = useNotifications();
  
  const hasNotifications = !!lastNotification;
  const displayText = hasNotifications
    ? lastNotification.mensaje
    : 'Sin notificaciones';
  
  const displayTime = hasNotifications
    ? formatTimeAgo(lastNotification.created_at)
    : '';
  
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🔔</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </View>
      
      <View style={styles.content}>
        <Text
          style={[
            styles.text,
            !hasNotifications && styles.noNotificationText
          ]}
          numberOfLines={2}
        >
          {displayText}
        </Text>
        
        {displayTime ? (
          <Text style={styles.time}>{displayTime}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  iconContainer: {
    position: 'relative',
    marginRight: 12,
  },
  icon: {
    fontSize: 24,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  noNotificationText: {
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  time: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
});
