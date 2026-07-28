import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useDismissKeyboardWhenVisible } from "../../hooks/useDismissKeyboardWhenVisible";
import { Ionicons } from "@expo/vector-icons";
import { AppInput } from "../../design-system/components/AppInput";
import { Modal } from "@/design-system/components";
import { COLORS } from "../../constants";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type Option = string | { label: string; value: string };

interface SelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  title: string;
  options: Option[];
  searchable?: boolean;
  currentValue?: string;
  placeholder?: string;
}

export default function SelectionModal({
  visible,
  onClose,
  onSelect,
  title,
  options,
  searchable = false,
  currentValue,
  placeholder = "Buscar...",
}: SelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  useDismissKeyboardWhenVisible(visible);

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery) return options;

    const query = searchQuery.toLowerCase();
    return options.filter((option) => {
      const label = typeof option === "string" ? option : option.label;
      return label.toLowerCase().includes(query);
    });
  }, [options, searchQuery, searchable]);

  const handleSelect = (option: Option) => {
    const value = typeof option === "string" ? option : option.value;
    onSelect(value);
    onClose();
    setSearchQuery(""); // Reset search on close
  };

  const renderItem = ({ item }: { item: Option }) => {
    const label = typeof item === "string" ? item : item.label;
    const value = typeof item === "string" ? item : item.value;
    const isSelected = currentValue === value;

    return (
      <TouchableOpacity
        style={[styles.optionItem, isSelected && styles.optionItemSelected]}
        onPress={() => handleSelect(item)}
      >
        <Text
          style={[styles.optionText, isSelected && styles.optionTextSelected]}
        >
          {label}
        </Text>
        {isSelected && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      variant="bottom"
      title={title}
      contentStyle={styles.modalContent}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        style={styles.kavWrapper}
      >
        {/* Search Bar */}
        {searchable && (
          <AppInput
            containerStyle={styles.searchContainer}
            placeholder={placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            leftIcon={<Ionicons name="search" size={20} color={COLORS.textTertiary} />}
            rightIcon={
              searchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
                </TouchableOpacity>
              ) : undefined
            }
          />
        )}

        {/* List */}
        <FlatList
          data={filteredOptions}
          keyExtractor={(item, index) => {
            const val = typeof item === "string" ? item : item.value;
            return `${val}-${index}`;
          }}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={15}
          maxToRenderPerBatch={20}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No se encontraron resultados
              </Text>
            </View>
          }
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    maxHeight: SCREEN_HEIGHT * 0.7,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  kavWrapper: {
    minHeight: SCREEN_HEIGHT * 0.5,
  },
  searchContainer: {
    margin: 16,
    width: "auto", // Override AppInput's 100% to respect margins
  },
  list: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  listContent: {
    paddingBottom: 40,
  },
  optionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background,
  },
  optionItemSelected: {
    backgroundColor: COLORS.backgroundDark,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  optionTextSelected: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  emptyContainer: {
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textTertiary,
    fontSize: 14,
  },
});
