import { Footer } from "@/components/storefront/Footer";
import { Header } from "@/components/storefront/Header";
import { SmoothScrollProvider } from "@/components/storefront/SmoothScrollProvider";
import { CartProvider } from "@/lib/cart/CartContext";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <SmoothScrollProvider>
        <div className="flex min-h-full flex-1 flex-col bg-shop-bg font-shop-body text-shop-ink">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </SmoothScrollProvider>
    </CartProvider>
  );
}
