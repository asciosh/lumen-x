using Bunit;
using LumenX.Dashboard.Components.Pages;
using LumenX.Dashboard.Services;
using LumenX.Dashboard.Tests.TestSupport;

namespace LumenX.Dashboard.Tests;

public class ProductsPageTests : DashboardTestBase
{
    [Fact]
    public void Lists_the_products_with_links_to_their_pages()
    {
        Api.Products = ApiResult<List<ProductDto>>.Ok(new List<ProductDto>
        {
            Samples.Product(1, "Pane", "P-1"),
            Samples.Product(2, "Latte", null)
        });

        var cut = Render<Products>();

        var links = cut.FindAll("table a");
        Assert.Equal(new[] { "Pane", "Latte" }, links.Select(a => a.TextContent).ToArray());
        Assert.Equal("/products/1", links[0].GetAttribute("href"));
        Assert.Equal("/products/2", links[1].GetAttribute("href"));
    }

    [Fact]
    public void Empty_list_explains_what_to_do()
    {
        var cut = Render<Products>();

        Assert.Contains("Nessun prodotto", cut.Markup);
        Assert.Empty(cut.FindAll("table"));
    }

    [Fact]
    public void Backend_down_shows_a_readable_error()
    {
        Api.Products = ApiResult<List<ProductDto>>.Fail(0, "Backend non raggiungibile. Controlla che sia avviato.");

        var cut = Render<Products>();

        Assert.Contains("Backend non raggiungibile", cut.Find(".alert-error").TextContent);
    }

    [Fact]
    public void Creating_a_product_calls_the_backend_and_refreshes_the_list()
    {
        var cut = Render<Products>();

        FieldInLabel(cut, "Nome").Change("Pane");
        FieldInLabel(cut, "SKU").Change("P-1");
        ButtonByText(cut, "Crea").Click();

        cut.WaitForAssertion(() => Assert.Equal("Pane", cut.Find("table a").TextContent));
        Assert.Equal(("Pane", "P-1"), Api.CreatedProducts.Single());
    }

    [Fact]
    public void Empty_sku_is_sent_as_null()
    {
        var cut = Render<Products>();

        FieldInLabel(cut, "Nome").Change("Latte");
        ButtonByText(cut, "Crea").Click();

        cut.WaitForAssertion(() => Assert.Single(Api.CreatedProducts));
        Assert.Null(Api.CreatedProducts[0].Sku);
    }

    [Fact]
    public void Empty_name_is_rejected_without_calling_the_backend()
    {
        var cut = Render<Products>();

        ButtonByText(cut, "Crea").Click();

        Assert.Contains("Inserisci un nome", cut.Find(".alert-error").TextContent);
        Assert.Empty(Api.CreatedProducts);
    }

    [Fact]
    public void Backend_error_on_create_is_shown_next_to_the_form()
    {
        Api.CreateProductResult = ApiResult<ProductDto>.Fail(409, "Esiste già un prodotto con questo nome.");
        var cut = Render<Products>();

        FieldInLabel(cut, "Nome").Change("Pane");
        ButtonByText(cut, "Crea").Click();

        cut.WaitForAssertion(() =>
            Assert.Contains("Esiste già un prodotto con questo nome.", cut.Find(".alert-error").TextContent));
    }
}
