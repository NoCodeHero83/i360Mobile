import React, { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import PropertyDetail from "../../../components/Details/PropertyDetail";
import { usePropertyCacheStore, CachedPropertyData } from "@/store/propertyCacheStore";

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams();
  const [initialData, setInitialData] = useState<CachedPropertyData | null>(null);
  const getProperty = usePropertyCacheStore((state) => state.getProperty);

  useEffect(() => {
    if (id) {
      const cached = getProperty(id as string);
      setInitialData(cached);
    }
  }, [id, getProperty]);

  return (
    <PropertyDetail
      propertyId={id as string}
      initialData={initialData}
    />
  );
}
